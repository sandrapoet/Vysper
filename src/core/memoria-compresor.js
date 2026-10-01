/**
 * Compresor de la memoria de sesion: baja turnos de L1 a L2 (resumen
 * detallado) y de L2 a L3 (semillas "[min N] tema → conclusion").
 *
 * Dos modos, en ese orden:
 *   A. LLM: la cadena que arme el llamador (Anthropic -> Gemini -> Ollama).
 *   B. Determinista: oraciones con entidades o verbos de decision. Es el
 *      piso: sin modelos disponibles la memoria igual cabe en su presupuesto,
 *      peor resumida, pero nunca se pierde una clave de ticket.
 *
 * Ver docs/superpowers/specs/2026-10-01-memoria-de-sesion-design.md (D5).
 */

const { primeroQueResponda } = require('./asesoria-modelos');

// Aproximacion de 4 caracteres por token: no hace falta exactitud, hace
// falta que un log pegado pese lo que pesa (D2).
function estimarTokens(texto) {
  return Math.ceil(String(texto || '').length / 4);
}

// Lo que la compresion NUNCA puede perder: claves de Jira, PRs/issues y
// menciones a ramas/ambientes.
const ENTIDAD_RE = /\b[A-Z][A-Z0-9]+-\d+\b|#\d+\b|\bPRs?\b|\b(?:develop|staging|main)\b/;
const DECISION_RE = new RegExp(
  '\\b(?:decid\\w*|acord\\w*|se implement\\w*|implement[eéo]\\w*|qued[oó] en|vamos a|hay que|' +
    'pendiente\\w*|bloquead\\w*|incidente\\w*|resuelt\\w*|se cerr\\w*|se merge\\w*|mergead\\w*|' +
    'se despleg\\w*|aprobad\\w*|rechazad\\w*|asignad\\w*|responsable)\\b',
  'i'
);
const SALUDO_RE = /^(?:hola|gracias|ok|okay|va|vale|perfecto|listo|buenas|buenos d[ií]as|s[ií]|no)\b[\s.!,]*$/i;

function recortarATokens(texto, maxTokens) {
  const max = Math.max(1, maxTokens) * 4;
  const limpio = String(texto || '').trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`;
}

function oraciones(texto) {
  return String(texto || '')
    .split(/(?<=[.!?¿¡])\s+|\n+/)
    .map((o) => o.trim())
    .filter((o) => o && !SALUDO_RE.test(o));
}

/**
 * Modo B. `minuto` solo se usa en L3, para el prefijo de la semilla.
 */
function comprimirDeterminista(texto, nivel, maxTokens, { minuto = 0 } = {}) {
  const todas = oraciones(texto);
  let elegidas = todas.filter((o) => ENTIDAD_RE.test(o) || DECISION_RE.test(o));
  // Sin nada marcable, la primera oracion es mejor que una capa vacia: al
  // menos dice de que se hablo.
  if (elegidas.length === 0 && todas.length > 0) elegidas = [todas[0]];
  if (nivel === 'L3') {
    const semilla = elegidas.join(' ').replace(/\s+/g, ' ');
    return recortarATokens(`[min ${minuto}] ${semilla}`, maxTokens);
  }
  return recortarATokens(elegidas.join('\n'), maxTokens);
}

function promptDeCompresion(texto, nivel, maxTokens, minuto) {
  const formato = nivel === 'L3'
    ? `Formato de salida: una o pocas lineas "[min ${minuto}] tema → conclusión/acción".`
    : 'Formato de salida: viñetas cortas, una idea por viñeta.';
  return (
    `Comprime el siguiente fragmento de conversación al nivel ${nivel} ` +
    `(${nivel === 'L3' ? 'semilla, ~10% del original' : 'detallado, ~30% del original'}).\n` +
    'Preserva:\n' +
    '- Decisiones tomadas y su justificación.\n' +
    '- Entidades: tickets (PROJ-123), PRs (#445), ramas/ambientes, personas.\n' +
    '- Acciones en curso o pendientes.\n' +
    '- Incidentes y su estado.\n' +
    'Elimina:\n' +
    '- Saludos, confirmaciones, redundancias.\n' +
    '- Detalles técnicos ya resueltos.\n' +
    'No agregues nada que no esté en el texto. Responde SOLO con el resumen.\n' +
    `${formato}\n` +
    `Máximo ${maxTokens} tokens.\n\n` +
    `Texto:\n${texto}`
  );
}

/**
 * `proveedores`: [{nombre, llamar}] como los de primeroQueResponda, o una
 * funcion que los devuelve (se evalua en cada compresion: un proveedor puede
 * aparecer o caerse durante la sesion).
 *
 * comprimir() nunca lanza: devuelve {texto, modo: 'llm'|'determinista',
 * proveedor, error?}.
 */
function crearCompresor({ proveedores = [] } = {}) {
  const obtener = typeof proveedores === 'function' ? proveedores : () => proveedores;

  async function comprimir(texto, nivel, maxTokens, { minuto = 0 } = {}) {
    const lista = obtener() || [];
    let error = null;
    if (lista.length > 0) {
      try {
        const { texto: salida, proveedor } = await primeroQueResponda(
          lista,
          promptDeCompresion(texto, nivel, maxTokens, minuto)
        );
        // Un "resumen" mas largo que el original no comprime nada: se
        // trata como fallo del modelo y entra el determinista.
        if (estimarTokens(salida) <= Math.max(maxTokens * 1.5, 8)) {
          // Los modelos omiten el "[min N]" de la semilla aunque se pida
          // (visto con Haiku el 2026-10-01): se pone aca, no se negocia.
          const limpia = nivel === 'L3' && !/^\[min \d+\]/.test(salida.trim())
            ? `[min ${minuto}] ${salida.trim()}`
            : salida;
          return { texto: recortarATokens(limpia, maxTokens), modo: 'llm', proveedor };
        }
        error = `${proveedor}: la salida no comprimio (${estimarTokens(salida)} tokens)`;
      } catch (e) {
        error = e.message;
      }
    }
    return {
      texto: comprimirDeterminista(texto, nivel, maxTokens, { minuto }),
      modo: 'determinista',
      proveedor: null,
      ...(error ? { error } : {})
    };
  }

  return { comprimir };
}

module.exports = {
  crearCompresor,
  comprimirDeterminista,
  estimarTokens,
  recortarATokens,
  promptDeCompresion,
  ENTIDAD_RE
};
