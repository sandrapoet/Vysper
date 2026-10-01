/**
 * Clasificador de intencion del modo Silia (D6): antes de responder decide si
 * la pregunta es
 *   - "contextual": sobre algo ya hablado en esta sesion -> memoria.
 *   - "proyecto":   sobre el proyecto, fuera de la sesion -> Cerebro.
 *   - "off_topic":  general, no necesita ni memoria ni Cerebro.
 *
 * Ante la duda, "proyecto": consultar Cerebro de mas cuesta tiempo, quedarse
 * corto cuesta una respuesta inventada.
 */

const { primeroQueResponda } = require('./asesoria-modelos');
const { primerObjetoJson } = require('./json-extract');

const CATEGORIAS = ['contextual', 'proyecto', 'off_topic'];
const UMBRAL_CONFIANZA = 0.6;

// Mencionar una entidad o una fuente es pedir datos reales: no hace falta
// gastar una llamada al modelo para saberlo.
const SENAL_DE_PROYECTO_RE = new RegExp(
  '\\b[A-Z][A-Z0-9]+-\\d+\\b|#\\d+\\b|\\b(?:jira|notion|github|slack|confluence|sprint|ticket|tickets|' +
    'pull request|staging|develop|deploy\\w*|despleg\\w*|producci[oó]n|merge\\w*|backlog|epica|épica)\\b',
  'i'
);

function promptDeClasificacion(pregunta, resumen) {
  return (
    'Clasifica la siguiente pregunta del usuario en una de tres categorías:\n' +
    '- "contextual": se refiere a algo discutido en la sesión actual (ver el resumen).\n' +
    '- "proyecto": es sobre el proyecto/empresa (tickets, PRs, estado, documentación, decisiones ' +
    'del equipo) pero NO está resuelto en esta sesión: necesita consultar Cerebro.\n' +
    '- "off_topic": es general, no requiere memoria ni Cerebro.\n\n' +
    `Contexto de la sesión (resumen):\n${resumen || '(sesión vacía)'}\n\n` +
    `Pregunta: ${pregunta}\n\n` +
    'Responde SOLO con JSON: {"categoria": "contextual|proyecto|off_topic", "confianza": 0.0-1.0}'
  );
}

/**
 * Nunca lanza. Devuelve {categoria, confianza, origen, error?}; `origen` es
 * 'regla', 'modelo' o 'respaldo'.
 */
async function clasificarPregunta(pregunta, resumen, proveedores = []) {
  const texto = String(pregunta || '').trim();
  if (SENAL_DE_PROYECTO_RE.test(texto)) {
    return { categoria: 'proyecto', confianza: 1, origen: 'regla' };
  }
  if (!proveedores.length) {
    return { categoria: 'proyecto', confianza: 0, origen: 'respaldo', error: 'sin modelos para clasificar' };
  }
  try {
    const { texto: salida, proveedor } = await primeroQueResponda(proveedores, promptDeClasificacion(texto, resumen));
    const json = primerObjetoJson(salida);
    // Sin JSON se acepta una palabra suelta, que es lo que devuelven los
    // modelos chicos cuando ignoran el formato.
    const bruto = normalizarCategoria(json?.categoria ?? salida);
    const confianza = Number.isFinite(Number(json?.confianza)) ? Number(json.confianza) : (bruto ? 0.7 : 0);
    if (!bruto) {
      return { categoria: 'proyecto', confianza: 0, origen: 'respaldo', proveedor, error: `salida no valida: ${String(salida).slice(0, 80)}` };
    }
    if (confianza < UMBRAL_CONFIANZA) {
      return { categoria: 'proyecto', confianza, origen: 'respaldo', proveedor, sugerida: bruto };
    }
    return { categoria: bruto, confianza, origen: 'modelo', proveedor };
  } catch (error) {
    return { categoria: 'proyecto', confianza: 0, origen: 'respaldo', error: error.message };
  }
}

function normalizarCategoria(valor) {
  const t = String(valor || '').toLowerCase().replace(/[^a-z_ -]/g, ' ');
  if (/\boff[_ -]?topic\b/.test(t)) return 'off_topic';
  return CATEGORIAS.find((c) => new RegExp(`\\b${c}\\b`).test(t)) || null;
}

module.exports = {
  clasificarPregunta,
  promptDeClasificacion,
  normalizarCategoria,
  CATEGORIAS,
  UMBRAL_CONFIANZA,
  SENAL_DE_PROYECTO_RE
};
