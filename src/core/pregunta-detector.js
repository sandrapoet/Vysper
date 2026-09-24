/**
 * Detector de preguntas, etapa 1 (pura, gratis).
 *
 * Filtra el ruido de reconocimiento de voz ANTES de gastar una llamada al
 * modelo rapido (etapa 2, ver detectarPregunta mas abajo). Existe porque el
 * commit e48a0a2 (2026-09-23) mando TODO fragmento de dictado a Cerebro,
 * incluidos los errores de reconocimiento de una reunion real:
 *
 *   "para liar ver las cosas, digamos, en este maldado."
 *   "y vamos a llamar ahi mas empo, y eso es lo que llamar el empo de crear."
 *
 * cada uno pagando 5-48s de Cerebro para volver con un rechazo del modelo.
 *
 * Tres criterios, en orden (los tres deben cumplirse):
 *
 *   1. Longitud util >= MIN_CARACTERES: menos de eso no es una consulta
 *      ("ok", "ajá").
 *   2. Marcador interrogativo: "?" o una palabra/frase interrogativa
 *      ("que", "como", "existe", "tenemos", "hay", "se puede"...).
 *   3. Coherencia lexica: de las palabras "largas" (>=4 letras) del
 *      fragmento, no puede ser mas de la mitad ajena a una lista blanca
 *      minima de espanol comun + vocabulario del dominio. Por encima de eso
 *      es basura de reconocimiento ("empo", "agir", "maldado") aunque tenga
 *      un marcador suelto.
 *
 * CALIBRACION (obligatoria, contra el fixture real de
 * test/pregunta-detector.test.js): con este fixture los criterios 1 y 2 ya
 * separan limpio los dos grupos -- el criterio 3 no llega a ser el que
 * decide en NINGUNO de los 9 casos, pero se implementa igual porque en una
 * reunion real habra fragmentos con marcador suelto y basura de
 * reconocimiento alrededor, que es exactamente lo que el criterio 3 esta
 * para atajar.
 *
 * ZONA GRIS QUE NO SE PUDO SEPARAR LIMPIO: "que" sin tilde es interrogativo
 * ("que son los subagentes") o relativo ("eso es lo que llamar el empo de
 * crear"), y el reconocimiento de voz nunca pone tildes para distinguirlos.
 * Se resuelve con una heuristica: "que" NO cuenta como marcador cuando el
 * token inmediatamente anterior es un articulo/demostrativo (lo/el/la/los/
 * las) -- captura el caso real del fixture ("...es LO QUE llamar..."). Esa
 * heuristica falla con construcciones como "digo que..." o "es que..." (el
 * "que" relativo/subordinante sin articulo delante cuela como marcador). Por
 * la regla de desempate del plan -- preferir un FALSO POSITIVO (una consulta
 * de mas) antes que perder una pregunta en silencio -- se deja asi a
 * proposito: no se amplia la lista de exclusiones mas alla de lo verificado
 * contra el fixture real, porque cada exclusion nueva es una forma nueva de
 * perder una pregunta real sin aviso.
 */

const MIN_CARACTERES = 20;

// Palabras interrogativas de una sola palabra, sin tilde (el reconocimiento
// de voz casi nunca las pone). "que" se maneja aparte por la ambiguedad de
// arriba.
const MARCADORES_UNA_PALABRA = [
  'que', 'como', 'cual', 'cuales', 'donde', 'quien', 'quienes', 'cuando',
  'cuanto', 'cuantos', 'existe', 'existen', 'tenemos', 'hay', 'puedo', 'podemos'
];

// Frases interrogativas de mas de una palabra: se buscan como sub-secuencia
// de tokens, no como substring crudo (para no matchear "porque" pegado).
const MARCADORES_FRASE = ['por que', 'se puede'];

// "que" bare inmediatamente despues de uno de estos es relativo ("lo que",
// "el que dijo"), no interrogativo. Ver la nota de calibracion arriba.
const PRECEDENTES_RELATIVOS = ['lo', 'el', 'la', 'los', 'las'];

// Lista blanca minima: espanol comun + vocabulario del dominio (Vysper/
// Cerebro/desarrollo de software). Deliberadamente chica -- crecer esto sin
// medir contra un fixture real es como quedo el filtro de palabras clave
// que este detector reemplaza (ver src/core/cerebro-query-router.js).
const PALABRAS_CONOCIDAS = new Set([
  // comunes
  'para', 'pero', 'esta', 'estas', 'esto', 'esos', 'esas', 'todo', 'toda',
  'todos', 'todas', 'puede', 'puedo', 'podemos', 'usar', 'tenemos', 'existe',
  'donde', 'cuando', 'cuanto', 'trata', 'impide', 'impiden', 'creacion',
  'creando', 'creado', 'hablamos', 'hablando', 'reunion', 'cliente',
  'equipo', 'proyecto', 'trabajo', 'ayuda', 'entender', 'entiendo',
  // dominio Vysper / Cerebro / desarrollo
  'subagentes', 'subagente', 'agentes', 'agente', 'motor', 'skill', 'skills',
  'sistema', 'diseno', 'arquitectura', 'arquitecto', 'ticket', 'tickets',
  'sprint', 'pipeline', 'pipelines', 'reportes', 'reporte', 'auditoria',
  'endpoint', 'endpoints', 'tablas', 'pobladas', 'guardrails', 'implementacion',
  'implementado', 'implementada', 'deploy', 'despliegue', 'produccion',
  'riesgo', 'riesgos', 'propuesta', 'propuestas', 'codigo', 'modulo',
  'modulos', 'funcion', 'funciones', 'backend', 'frontend'
]);

function stripAccents(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(text) {
  return stripAccents(typeof text === 'string' ? text.trim().toLowerCase() : '');
}

/** Extrae solo secuencias de letras (unicode) -- descarta puntuacion, numeros, guiones. */
function tokensDeLetras(normalizado) {
  return normalizado.match(/\p{L}+/gu) || [];
}

function tieneMarcadorInterrogativo(normalizado) {
  if (normalizado.includes('?')) return true;

  const tokens = tokensDeLetras(normalizado);
  const reconstruido = tokens.join(' ');
  if (MARCADORES_FRASE.some((frase) => reconstruido.includes(frase))) return true;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!MARCADORES_UNA_PALABRA.includes(token)) continue;
    if (token === 'que' && PRECEDENTES_RELATIVOS.includes(tokens[i - 1])) continue;
    return true;
  }
  return false;
}

function esConocida(palabra) {
  if (PALABRAS_CONOCIDAS.has(palabra)) return true;
  // Estemizacion ingenua de plural, solo como red adicional -- las formas
  // que importan para el fixture ya estan explicitas arriba.
  if (palabra.endsWith('es') && PALABRAS_CONOCIDAS.has(palabra.slice(0, -2))) return true;
  if (palabra.endsWith('s') && PALABRAS_CONOCIDAS.has(palabra.slice(0, -1))) return true;
  return false;
}

function coherenciaLexica(normalizado) {
  const palabrasLargas = tokensDeLetras(normalizado).filter((t) => t.length >= 4);
  if (palabrasLargas.length === 0) {
    // Sin palabras largas no hay senal para este criterio. Preferimos el
    // falso positivo (dejar pasar) al falso negativo, igual que en el resto
    // de esta calibracion.
    return { ok: true, ratioDesconocidas: 0 };
  }
  const desconocidas = palabrasLargas.filter((p) => !esConocida(p));
  const ratio = desconocidas.length / palabrasLargas.length;
  // "mas de la mitad" -> estrictamente mayor, no >=, para no descartar un
  // empate (ver Task 5 del plan: AGE-466 en el fixture real cae justo en el
  // limite una vez que se filtran los tokens de <4 letras).
  return { ok: ratio <= 0.5, ratioDesconocidas: ratio };
}

/**
 * Etapa 1 del detector: decide si un fragmento de dictado PUEDE ser una
 * pregunta, sin gastar ninguna llamada a un modelo.
 *
 * @param {string} texto
 * @returns {{candidato: boolean, motivo: string|null}}
 */
function puedeSerPregunta(texto) {
  if (typeof texto !== 'string') {
    return { candidato: false, motivo: 'invalido' };
  }

  const util = texto.trim();
  if (util.length < MIN_CARACTERES) {
    return { candidato: false, motivo: 'demasiado-corto' };
  }

  const normalizado = normalize(util);

  if (!tieneMarcadorInterrogativo(normalizado)) {
    return { candidato: false, motivo: 'sin-marcador-interrogativo' };
  }

  const { ok } = coherenciaLexica(normalizado);
  if (!ok) {
    return { candidato: false, motivo: 'incoherente-lexicamente' };
  }

  return { candidato: true, motivo: null };
}

module.exports = { puedeSerPregunta, MIN_CARACTERES };
