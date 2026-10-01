/**
 * Como responde el modo Silia con memoria de sesion (D7):
 *
 *   contextual -> modelo rapido + lo relevante de L1/L2/L3/expediente
 *   proyecto   -> Cerebro, con la memoria y el proyecto en --contexto-file
 *   off_topic  -> modelo rapido, sin contexto
 *
 * Toda respuesta entra a L1. Si el camino rapido no responde, se cae a
 * Cerebro: mejor tarde y con datos que nunca.
 *
 * Sin Electron ni fs: todo lo que toca el mundo llega por `deps`, para poder
 * probarlo directo.
 */

const { primeroQueResponda } = require('./asesoria-modelos');
const { clasificarPregunta } = require('./memoria-clasificador');
const { identificarProyecto } = require('./memoria-proyecto');
const { formatearContexto } = require('./memoria-sesion');

const SYSTEM_PROMPT_MEMORIA =
  'Eres el motor de memoria de Vysper, en el modo Silia (gestión del proyecto). Respondes ' +
  'con lo que ya se habló en esta sesión, que va abajo en capas: L1 son los turnos recientes ' +
  'completos, L2 resúmenes de turnos anteriores, L3 semillas "[min N] tema → conclusión" de lo ' +
  'más viejo, y "hechos ya verificados" lo que Cerebro trajo antes de Jira/GitHub/Notion/Slack. ' +
  'Los ítems con ⭐ ya se consultaron antes: son importantes.\n\n' +
  'Reglas:\n' +
  '- Nunca inventes información: ni tickets, ni números de PR, ni estados, ni nombres.\n' +
  '- Si el contexto no alcanza para responder, dilo en una frase y ofrece consultar Cerebro ' +
  '(el usuario puede repetir la pregunta mencionando Jira/GitHub/Notion).\n' +
  '- Cita de qué capa sale lo que afirmas cuando no sea obvio ("según lo verificado antes...").\n' +
  '- Responde en español de México, tuteando, breve y concreto.\n';

const MARCA_MEMORIA = '🧠 _Desde la memoria de la sesión_';

function hechosDeCerebro(pregunta, result, turno) {
  const resumen = String(result?.summary || '').trim();
  if (!resumen) return [];
  const fuentes = (Array.isArray(result?.citations) ? result.citations : [])
    .map((c) => c?.file_source)
    .filter(Boolean)
    .slice(0, 3);
  return [{ fuente: fuentes.join(', ') || `cerebro:turno-${turno}`, texto: `${pregunta} → ${resumen}` }];
}

/**
 * deps:
 *   memoria                 MemoriaSesion
 *   proveedoresClasificador [{nombre, llamar}] (nubes + Ollama)
 *   proveedoresRapidos      [{nombre, llamar}] (nubes)
 *   runDiagnose(texto, {persona, contextoFile}) -> result de Cerebro
 *   escribirContexto(obj) -> ruta ; borrarContexto(ruta)
 *   formatear(result) -> texto para el chat
 *   proyectos               registro de memoria-proyecto
 *   persona                 'silia' por defecto
 *   logger
 *
 * Devuelve {texto, categoria, clasificacion, origen, mantenimiento}. Los
 * errores de Cerebro se propagan (el llamador ya sabe mostrarlos).
 */
async function responderConMemoria(pregunta, deps) {
  const {
    memoria,
    proveedoresClasificador = [],
    proveedoresRapidos = [],
    runDiagnose,
    escribirContexto,
    borrarContexto = () => {},
    formatear = (r) => String(r?.summary || ''),
    proyectos,
    persona = 'silia',
    logger = null
  } = deps;

  const resumen = memoria.resumen();
  const clasificacion = await clasificarPregunta(pregunta, resumen, proveedoresClasificador);
  if (clasificacion.origen === 'respaldo' && logger) {
    logger.warn('Memoria: clasificacion por respaldo, se consulta Cerebro', {
      error: clasificacion.error, sugerida: clasificacion.sugerida
    });
  }

  let categoria = clasificacion.categoria;
  let texto = null;
  let paraMemoria = null;
  let origen = null;

  if (categoria === 'contextual') {
    const ctx = memoria.contextoRelevante(pregunta);
    const hayAlgo = ctx.turnos.length + ctx.l2.length + ctx.l3.length + ctx.expediente.length > 0;
    if (hayAlgo && proveedoresRapidos.length) {
      try {
        const prompt = `${SYSTEM_PROMPT_MEMORIA}\n${formatearContexto(ctx)}\n\n## Pregunta\n${pregunta}`;
        const r = await primeroQueResponda(proveedoresRapidos, prompt);
        paraMemoria = r.texto.trim();
        texto = `${MARCA_MEMORIA}\n\n${paraMemoria}`;
        origen = `memoria:${r.proveedor}`;
      } catch (error) {
        if (logger) logger.warn('Memoria: la respuesta contextual fallo, se consulta Cerebro', { error: error.message });
      }
    }
    if (texto === null) categoria = 'proyecto';
  }

  if (categoria === 'off_topic') {
    try {
      const r = await primeroQueResponda(
        proveedoresRapidos,
        'Responde en español de México, tuteando, breve y concreto. No inventes datos.\n\n' + pregunta
      );
      paraMemoria = r.texto.trim();
      texto = paraMemoria;
      origen = `directo:${r.proveedor}`;
      memoria.registrarUso('directo');
    } catch (error) {
      if (logger) logger.warn('Memoria: la respuesta directa fallo, se consulta Cerebro', { error: error.message });
      categoria = 'proyecto';
    }
  }

  let proyecto = null;
  if (categoria === 'proyecto') {
    proyecto = identificarProyecto(pregunta, resumen, proyectos);
    const ruta = escribirContexto({ transcripcion: '', ...memoria.paraCerebro(), proyecto });
    let result;
    try {
      result = await runDiagnose(pregunta, { persona, contextoFile: ruta });
    } finally {
      borrarContexto(ruta);
    }
    memoria.registrarUso('cerebro');
    texto = formatear(result);
    paraMemoria = String(result?.summary || texto);
    origen = 'cerebro';
    memoria.agregarHechos(hechosDeCerebro(pregunta, result, memoria.contador + 1), { proyecto: proyecto.dominio });
  }

  memoria.agregarTurno({ usuario: pregunta, respuesta: paraMemoria, modo: persona, categoria });
  const mantenimiento = memoria.mantener();
  return { texto, categoria, clasificacion, origen, proyecto, mantenimiento };
}

/**
 * El contexto para una consulta de System Design: el de la asesoria en vivo
 * (transcripcion + hilo) MAS la memoria de la sesion y el proyecto (D10).
 * Los turnos de la asesoria van primero: son los de esta reunion.
 */
function contextoParaSystemDesign(contextoAsesoria, memoria, pregunta, proyectos) {
  const deMemoria = memoria.paraCerebro({ maxTurnos: 3 });
  const turnosAsesoria = Array.isArray(contextoAsesoria?.turnos) ? contextoAsesoria.turnos : [];
  return {
    transcripcion: String(contextoAsesoria?.transcripcion || ''),
    // La verificada de la asesoria tambien entra a la memoria: sin este
    // filtro la misma consulta viajaria dos veces.
    turnos: [
      ...deMemoria.turnos.filter((t) => !turnosAsesoria.some((a) => a.pregunta === t.pregunta)),
      ...turnosAsesoria
    ].slice(-6),
    memoria: deMemoria.memoria,
    expediente: deMemoria.expediente,
    proyecto: identificarProyecto(pregunta, memoria.resumen(), proyectos)
  };
}

/** Texto de /memoria status. */
function formatearStatus(s) {
  const t = s.tokens;
  const pct = (n) => (s.limites ? Math.round((n / limiteDe(s.limites)) * 100) : 0);
  const lineas = [
    `**Memoria de la sesión** \`${s.id}\`${s.restauradaDe ? ` (continúa \`${s.restauradaDe}\`)` : ''}`,
    `Turnos: ${s.turnos} · minuto ${s.minuto}`,
    '',
    `- **L1** (completo): ${s.capas.l1.items} turno(s), ${t.l1}/${s.limites.L1_TOKENS} tokens`,
    `- **L2** (~30%): ${s.capas.l2.items} resumen(es), ${t.l2}/${s.limites.L2_TOKENS} tokens, ⭐ ${s.capas.l2.estrellas}`,
    `- **L3** (semillas): ${s.capas.l3.items}, ${t.l3}/${s.limites.L3_TOKENS} tokens, ⭐ ${s.capas.l3.estrellas}`,
    `- **Expediente** (hechos de Cerebro): ${s.capas.expediente.items}, ${t.expediente}/${s.limites.EXPEDIENTE_TOKENS} tokens`,
    `- **Total**: ${t.total} tokens (${pct(t.total)}% del tope)`,
    '',
    `Compresiones: ${s.compresiones}` +
      (s.ultimaCompresion && s.ultimaCompresion.a !== 'olvido'
        ? ` · última ${s.ultimaCompresion.de}→${s.ultimaCompresion.a}, ratio ${s.ultimaCompresion.ratio} (${s.ultimaCompresion.modo}${s.ultimaCompresion.proveedor ? `/${s.ultimaCompresion.proveedor}` : ''})`
        : ''),
    `Usos: ${Object.entries(s.usos).map(([k, v]) => `${k} ${v}`).join(' · ')}`
  ];
  return lineas.join('\n');
}

function limiteDe(l) {
  return l.L1_TOKENS + l.L2_TOKENS + l.L3_TOKENS + l.EXPEDIENTE_TOKENS;
}

module.exports = {
  responderConMemoria,
  formatearStatus,
  contextoParaSystemDesign,
  hechosDeCerebro,
  SYSTEM_PROMPT_MEMORIA,
  MARCA_MEMORIA
};
