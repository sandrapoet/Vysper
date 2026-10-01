/**
 * Memoria conversacional de UNA sesion de Vysper, compartida por los modos
 * Silia y System Design (D1). Tres capas con presupuesto en tokens (D2):
 *
 *   L1  turnos completos             <= 10 turnos y 2500 tokens
 *   L2  resumenes al ~30%            <= 3000 tokens
 *   L3  semillas "[min N] tema → x"  <= 1500 tokens (se recomprime)
 *   expediente: hechos que trajo Cerebro, con su fuente, <= 1000 tokens
 *
 * Tope total: 8000 tokens, por construccion. Cerebro no tiene estado: esto
 * viaja en cada --contexto-file. Ver
 * docs/superpowers/specs/2026-10-01-memoria-de-sesion-design.md
 */

const crypto = require('crypto');
const { estimarTokens, recortarATokens, ENTIDAD_RE } = require('./memoria-compresor');

const LIMITES_POR_DEFECTO = Object.freeze({
  L1_TURNOS: 10,
  // Al pasarse de L1_TURNOS bajan los mas viejos en bloque: resumir cinco
  // turnos juntos sale mejor que uno por uno, y cuesta una llamada en vez
  // de cinco.
  L1_BLOQUE: 5,
  L1_TOKENS: 2500,
  L2_TOKENS: 3000,
  L3_TOKENS: 1500,
  EXPEDIENTE_TOKENS: 1000,
  OLVIDO_TURNOS: 200,
  MAX_REGISTRO: 100
});

const CAPAS_DE_USO = ['l1', 'l2', 'l3', 'expediente', 'cerebro', 'directo'];

const STOPWORDS = new Set([
  'para', 'pero', 'como', 'esta', 'este', 'esto', 'esos', 'esas', 'estos', 'estas', 'que', 'cual',
  'cuales', 'donde', 'cuando', 'quien', 'sobre', 'entre', 'desde', 'hasta', 'porque', 'tiene',
  'tienen', 'hay', 'eso', 'esa', 'ese', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'del', 'con',
  'por', 'sus', 'mas', 'muy', 'todo', 'toda', 'todos', 'todas', 'algo', 'otra', 'otro', 'ahora',
  'entonces', 'tambien', 'puede', 'puedes', 'hacer', 'dime', 'sabes', 'quiero', 'necesito'
]);

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function palabrasClave(texto) {
  const set = new Set();
  for (const p of normalizar(texto).split(/[^a-z0-9#-]+/)) {
    if (p.length >= 4 && !STOPWORDS.has(p)) set.add(p);
  }
  return set;
}

function entidades(texto) {
  const re = new RegExp(ENTIDAD_RE.source, 'g');
  return new Set((String(texto || '').match(re) || []).map((e) => e.toUpperCase()));
}

function puntaje(pregunta, texto) {
  const claves = palabrasClave(pregunta);
  const ents = entidades(pregunta);
  if (claves.size === 0 && ents.size === 0) return 0;
  const otras = palabrasClave(texto);
  const otrasEnts = entidades(texto);
  let p = 0;
  for (const c of claves) if (otras.has(c)) p += 1;
  for (const e of ents) if (otrasEnts.has(e)) p += 3;
  return p;
}

function textoDeTurno(t) {
  return `Usuario (${t.modo || 'silia'}): ${t.usuario}\nRespuesta: ${t.respuesta}`;
}

// Un solo turno nunca puede comerse L1 entero (un log pegado): se conserva
// el principio y el final, que es donde suelen estar el comando y el error.
function acotar(texto, maxTokens) {
  const limpio = String(texto || '').trim();
  const max = maxTokens * 4;
  if (limpio.length <= max) return limpio;
  const mitad = Math.floor((max - 20) / 2);
  return `${limpio.slice(0, mitad)}\n…[recortado]…\n${limpio.slice(-mitad)}`;
}

function sumaTokens(items, campo = 'texto') {
  return items.reduce((s, i) => s + estimarTokens(i[campo]), 0);
}

class MemoriaSesion {
  /**
   * `compresor`: {comprimir(texto, nivel, maxTokens, {minuto})} (ver
   * memoria-compresor.js). `onCambio(evento)` se llama tras cada compresion
   * o reset -- ahi se engancha el log y la persistencia.
   */
  constructor({ compresor, ahora = () => Date.now(), limites = {}, onCambio = null } = {}) {
    if (!compresor) throw new Error('MemoriaSesion necesita un compresor');
    this.compresor = compresor;
    this.ahora = ahora;
    this.limites = { ...LIMITES_POR_DEFECTO, ...limites };
    this.onCambio = onCambio;
    this._cola = Promise.resolve();
    this.reset('inicio');
  }

  reset(motivo = '') {
    this.id = `${new Date(this.ahora()).toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    this.inicio = this.ahora();
    this.contador = 0;
    this.l1 = [];
    this.l2 = [];
    this.l3 = [];
    this.expediente = [];
    this.registro = [];
    this.usos = Object.fromEntries(CAPAS_DE_USO.map((c) => [c, 0]));
    this.restauradaDe = null;
    this.ultimoMotivoReset = motivo;
    if (motivo !== 'inicio') this._avisar({ tipo: 'reset', motivo });
  }

  minutoActual() {
    return Math.max(0, Math.floor((this.ahora() - this.inicio) / 60000));
  }

  agregarTurno({ usuario, respuesta, modo = 'silia', categoria = null } = {}) {
    const u = String(usuario || '').trim();
    const r = String(respuesta || '').trim();
    if (!u && !r) return null;
    // -20: el encabezado de textoDeTurno tambien pesa.
    const mitad = Math.floor(this.limites.L1_TOKENS / 2) - 20;
    const turno = {
      n: ++this.contador,
      minuto: this.minutoActual(),
      ts: this.ahora(),
      modo,
      categoria,
      usuario: acotar(u, mitad),
      respuesta: acotar(r, mitad)
    };
    this.l1.push(turno);
    return turno;
  }

  /**
   * Hechos que Cerebro ya verifico (citas + resumen). Una fuente repetida
   * reemplaza a la anterior: el dato nuevo es el vigente.
   */
  agregarHechos(hechos = [], { proyecto = null } = {}) {
    for (const h of hechos) {
      const fuente = String(h?.fuente || '').trim();
      const texto = String(h?.texto || '').trim();
      if (!fuente || !texto) continue;
      this.expediente = this.expediente.filter((e) => e.fuente !== fuente);
      this.expediente.push({
        fuente,
        texto: recortarATokens(texto, 250),
        proyecto: proyecto || null,
        ts: this.ahora(),
        turno: this.contador
      });
    }
    while (this.expediente.length > 1 && sumaTokens(this.expediente) > this.limites.EXPEDIENTE_TOKENS) {
      this.expediente.shift();
    }
  }

  registrarUso(capa) {
    if (capa in this.usos) this.usos[capa] += 1;
  }

  /** Rota las capas. Serializado: dos llamadas seguidas no se pisan. */
  mantener(opciones = {}) {
    const corrida = this._cola.then(() => this._rotar(opciones));
    this._cola = corrida.catch(() => {});
    return corrida;
  }

  /** /memoria comprimir: deja solo los 2 ultimos turnos en L1 y rota. */
  forzarCompresion() {
    return this.mantener({ l1Objetivo: 2 });
  }

  async _rotar({ l1Objetivo = null } = {}) {
    const L = this.limites;
    const hechas = [];

    // L1 -> L2
    const excedeL1 = () =>
      (l1Objetivo !== null ? this.l1.length > l1Objetivo : this.l1.length > L.L1_TURNOS) ||
      (this.l1.length > 1 && sumaTokens(this.l1.map((t) => ({ texto: textoDeTurno(t) }))) > L.L1_TOKENS);
    while (excedeL1() && this.l1.length > (l1Objetivo ?? 1)) {
      let tomar;
      if (l1Objetivo !== null) tomar = this.l1.length - l1Objetivo;
      else if (this.l1.length > L.L1_TURNOS) tomar = Math.min(L.L1_BLOQUE, this.l1.length - 1);
      else tomar = 1;
      const bloque = this.l1.splice(0, tomar);
      const original = bloque.map(textoDeTurno).join('\n\n');
      const tokensOriginales = estimarTokens(original);
      const objetivo = Math.min(Math.max(20, Math.ceil(tokensOriginales * 0.3)), Math.floor(L.L2_TOKENS / 3));
      const r = await this.compresor.comprimir(original, 'L2', objetivo, { minuto: bloque[0].minuto });
      const item = {
        id: `l2-${bloque[0].n}-${bloque[bloque.length - 1].n}`,
        desde: bloque[0].n,
        hasta: bloque[bloque.length - 1].n,
        minuto: bloque[0].minuto,
        texto: r.texto,
        tokensOriginales,
        estrella: false,
        consultas: 0
      };
      this.l2.push(item);
      hechas.push(this._registrar('L1', 'L2', tokensOriginales, item, r));
    }

    // L2 -> L3
    while (sumaTokens(this.l2) > L.L2_TOKENS) {
      const exceso = sumaTokens(this.l2) - L.L2_TOKENS + Math.floor(L.L2_TOKENS * 0.2);
      const candidatos = this._candidatos(this.l2, exceso);
      const bloque = candidatos.items;
      this.l2 = this.l2.filter((i) => !bloque.includes(i));
      const original = bloque.map((i) => i.texto).join('\n');
      const tokensOriginales = bloque.reduce((s, i) => s + i.tokensOriginales, 0);
      // 8% y no 10%: el redondeo y el "…" del recorte no pueden empujar una
      // semilla por encima del 10% prometido.
      const objetivo = Math.min(Math.max(15, Math.floor(tokensOriginales * 0.08)), Math.floor(L.L3_TOKENS / 3));
      const r = await this.compresor.comprimir(original, 'L3', objetivo, { minuto: bloque[0].minuto });
      const item = {
        id: `l3-${bloque[0].desde}-${bloque[bloque.length - 1].hasta}`,
        desde: bloque[0].desde,
        hasta: bloque[bloque.length - 1].hasta,
        minuto: bloque[0].minuto,
        texto: r.texto,
        tokensOriginales,
        estrella: bloque.some((i) => i.estrella),
        consultas: bloque.reduce((s, i) => s + i.consultas, 0)
      };
      this.l3.push(item);
      hechas.push(this._registrar('L2', 'L3', sumaTokens(bloque), item, r, candidatos.forzado));
    }

    // L3 se recomprime sobre si misma, con un objetivo cada vez mas chico
    // en proporcion a lo que cubre: el ratio decrece solo.
    if (sumaTokens(this.l3) > L.L3_TOKENS) {
      const estrellas = this.l3.filter((i) => i.estrella);
      let comprimibles = this.l3.filter((i) => !i.estrella);
      let todo = false;
      const espacio = Math.floor(L.L3_TOKENS * 0.7) - sumaTokens(estrellas);
      if (comprimibles.length < 2 || espacio < 30) {
        // Solo quedan semillas con ⭐ (o casi): el tope gana (D3).
        comprimibles = [...this.l3];
        todo = true;
      }
      const forzado = todo && estrellas.length > 0;
      const objetivo = todo ? Math.floor(L.L3_TOKENS * 0.7) : Math.max(30, espacio);
      const original = comprimibles.map((i) => i.texto).join('\n');
      const tokensAntes = sumaTokens(comprimibles);
      const r = await this.compresor.comprimir(original, 'L3', objetivo, { minuto: comprimibles[0].minuto });
      const item = {
        id: `l3-${comprimibles[0].desde}-${comprimibles[comprimibles.length - 1].hasta}-r`,
        desde: Math.min(...comprimibles.map((i) => i.desde)),
        hasta: Math.max(...comprimibles.map((i) => i.hasta)),
        minuto: comprimibles[0].minuto,
        texto: r.texto,
        tokensOriginales: comprimibles.reduce((s, i) => s + i.tokensOriginales, 0),
        estrella: forzado,
        consultas: comprimibles.reduce((s, i) => s + i.consultas, 0)
      };
      this.l3 = [...this.l3.filter((i) => !comprimibles.includes(i)), item].sort((a, b) => a.desde - b.desde);
      hechas.push(this._registrar('L3', 'L3', tokensAntes, item, r, forzado));
    }

    // Olvido (D4): semillas viejas que nadie consulto nunca.
    const antes = this.l3.length;
    this.l3 = this.l3.filter(
      (i) => i.estrella || i.consultas > 0 || this.contador - i.hasta <= L.OLVIDO_TURNOS
    );
    if (this.l3.length !== antes) {
      hechas.push(this._registrarOlvido(antes - this.l3.length));
    }

    if (hechas.length > 0) this._avisar({ tipo: 'compresion', compresiones: hechas });
    return hechas;
  }

  // Los mas viejos sin ⭐ hasta cubrir `tokensALiberar`. Si no alcanza con
  // los que no tienen ⭐, entra el mas viejo con ⭐: el tope gana (D3).
  _candidatos(items, tokensALiberar) {
    const sinEstrella = items.filter((i) => !i.estrella);
    const elegidos = [];
    let liberados = 0;
    for (const i of sinEstrella) {
      if (liberados >= tokensALiberar && elegidos.length > 0) break;
      elegidos.push(i);
      liberados += estimarTokens(i.texto);
    }
    let forzado = false;
    if (liberados < tokensALiberar) {
      for (const i of items) {
        if (elegidos.includes(i)) continue;
        if (liberados >= tokensALiberar && elegidos.length > 0) break;
        elegidos.push(i);
        liberados += estimarTokens(i.texto);
        forzado = forzado || i.estrella;
      }
    }
    return { items: items.filter((i) => elegidos.includes(i)), forzado };
  }

  _registrar(de, a, tokensAntes, item, r, forzado = false) {
    const tokensDespues = estimarTokens(item.texto);
    const entrada = {
      ts: new Date(this.ahora()).toISOString(),
      de,
      a,
      turnos: [item.desde, item.hasta],
      tokensAntes,
      tokensDespues,
      ratio: tokensAntes > 0 ? Number((tokensDespues / tokensAntes).toFixed(3)) : 0,
      modo: r.modo,
      proveedor: r.proveedor || null,
      ...(r.error ? { error: r.error } : {}),
      ...(forzado ? { forzado: true } : {})
    };
    this.registro.push(entrada);
    if (this.registro.length > this.limites.MAX_REGISTRO) {
      this.registro = this.registro.slice(-this.limites.MAX_REGISTRO);
    }
    return entrada;
  }

  _registrarOlvido(cuantas) {
    const entrada = { ts: new Date(this.ahora()).toISOString(), de: 'L3', a: 'olvido', semillas: cuantas };
    this.registro.push(entrada);
    return entrada;
  }

  _avisar(evento) {
    if (typeof this.onCambio !== 'function') return;
    try {
      this.onCambio(evento, this);
    } catch {
      // Un log o un guardado que falla no puede tumbar la conversacion.
    }
  }

  /**
   * Lo que sirve para responder `pregunta`: los ultimos turnos siempre, y de
   * L2/L3/expediente lo que comparte palabras o entidades. Lo de L2/L3 que
   * se devuelve queda con ⭐ (D3).
   */
  contextoRelevante(pregunta, { maxL2 = 5, maxExpediente = 6 } = {}) {
    const turnos = this.l1.slice(-6);
    const elegir = (items, max) =>
      items
        .map((i) => ({ i, p: puntaje(pregunta, `${i.fuente || ''} ${i.texto}`) }))
        .filter((x) => x.p > 0)
        .sort((a, b) => b.p - a.p)
        .slice(0, max)
        .map((x) => x.i);
    const l2 = elegir(this.l2, maxL2);
    const l3 = elegir(this.l3, this.l3.length);
    const expediente = elegir(this.expediente, maxExpediente);
    for (const i of [...l2, ...l3]) {
      i.estrella = true;
      i.consultas += 1;
    }
    if (turnos.length) this.registrarUso('l1');
    if (l2.length) this.registrarUso('l2');
    if (l3.length) this.registrarUso('l3');
    if (expediente.length) this.registrarUso('expediente');
    // Si nada coincide, L3 completa (es chica) para que el modelo al menos
    // sepa de que se hablo antes.
    return { turnos, l2, l3: l3.length ? l3 : [...this.l3], expediente };
  }

  /** Para el clasificador: corto y de que se hablo, no el detalle. */
  resumen(maxTokens = 800) {
    const partes = [];
    if (this.l3.length) partes.push(`Antes:\n${this.l3.map((i) => i.texto).join('\n')}`);
    if (this.l2.length) partes.push(`Hace un rato:\n${this.l2.slice(-3).map((i) => i.texto).join('\n')}`);
    if (this.l1.length) {
      partes.push(
        `Reciente:\n${this.l1.slice(-3).map((t) => `- ${recortarATokens(t.usuario, 60)}`).join('\n')}`
      );
    }
    return recortarATokens(partes.join('\n\n'), maxTokens);
  }

  /** El bloque `memoria`/`expediente`/`turnos` del --contexto-file de Cerebro. */
  paraCerebro({ maxTurnos = 5 } = {}) {
    return {
      turnos: this.l1.slice(-maxTurnos).map((t) => ({ pregunta: t.usuario, respuesta: t.respuesta })),
      memoria: {
        l2: this.l2.map((i) => ({ texto: i.texto, estrella: i.estrella })),
        l3: this.l3.map((i) => ({ texto: i.texto, estrella: i.estrella }))
      },
      expediente: this.expediente.map((e) => ({ fuente: e.fuente, texto: e.texto }))
    };
  }

  tieneContenido() {
    return this.l1.length + this.l2.length + this.l3.length + this.expediente.length > 0;
  }

  tokens() {
    const l1 = sumaTokens(this.l1.map((t) => ({ texto: textoDeTurno(t) })));
    const l2 = sumaTokens(this.l2);
    const l3 = sumaTokens(this.l3);
    const expediente = sumaTokens(this.expediente);
    return { l1, l2, l3, expediente, total: l1 + l2 + l3 + expediente };
  }

  status() {
    return {
      id: this.id,
      restauradaDe: this.restauradaDe,
      turnos: this.contador,
      minuto: this.minutoActual(),
      capas: {
        l1: { items: this.l1.length },
        l2: { items: this.l2.length, estrellas: this.l2.filter((i) => i.estrella).length },
        l3: { items: this.l3.length, estrellas: this.l3.filter((i) => i.estrella).length },
        expediente: { items: this.expediente.length }
      },
      tokens: this.tokens(),
      limites: { ...this.limites },
      compresiones: this.registro.filter((r) => r.a !== 'olvido').length,
      ultimaCompresion: this.registro[this.registro.length - 1] || null,
      usos: { ...this.usos }
    };
  }

  /** Lo que se persiste (D11): todo menos L1, que es la conversacion cruda. */
  serializar() {
    return {
      version: 1,
      id: this.id,
      inicio: new Date(this.inicio).toISOString(),
      guardadoEn: new Date(this.ahora()).toISOString(),
      contador: this.contador,
      l2: this.l2,
      l3: this.l3,
      expediente: this.expediente,
      registro: this.registro,
      usos: this.usos
    };
  }

  /** Carga una sesion previa. Datos invalidos se ignoran sin lanzar. */
  restaurar(datos) {
    if (!datos || typeof datos !== 'object' || datos.version !== 1) return false;
    const lista = (x) => (Array.isArray(x) ? x.filter((i) => i && typeof i.texto === 'string') : []);
    this.l2 = lista(datos.l2);
    this.l3 = lista(datos.l3);
    this.expediente = lista(datos.expediente).filter((e) => typeof e.fuente === 'string');
    this.registro = Array.isArray(datos.registro) ? datos.registro.slice(-this.limites.MAX_REGISTRO) : [];
    this.contador = Number.isFinite(datos.contador) ? datos.contador : 0;
    for (const c of CAPAS_DE_USO) {
      if (Number.isFinite(datos.usos?.[c])) this.usos[c] = datos.usos[c];
    }
    this.restauradaDe = typeof datos.id === 'string' ? datos.id : null;
    return true;
  }
}

/** Texto para el prompt de una respuesta contextual. */
function formatearContexto({ turnos = [], l2 = [], l3 = [], expediente = [] } = {}) {
  const partes = [];
  if (l3.length) partes.push(`## Semillas de la sesión (L3)\n${l3.map((i) => `${i.estrella ? '⭐ ' : ''}${i.texto}`).join('\n')}`);
  if (l2.length) partes.push(`## Resúmenes relevantes (L2)\n${l2.map((i) => `${i.estrella ? '⭐ ' : ''}${i.texto}`).join('\n')}`);
  if (expediente.length) {
    partes.push(`## Hechos ya verificados por Cerebro\n${expediente.map((e) => `- [${e.fuente}] ${e.texto}`).join('\n')}`);
  }
  if (turnos.length) partes.push(`## Turnos recientes (L1)\n${turnos.map(textoDeTurno).join('\n\n')}`);
  return partes.join('\n\n');
}

module.exports = { MemoriaSesion, formatearContexto, LIMITES_POR_DEFECTO, palabrasClave, puntaje };
