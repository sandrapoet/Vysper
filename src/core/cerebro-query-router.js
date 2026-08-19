/**
 * Pure text classification for routing "system-design" mode messages to
 * Cerebro (the Silia backend) when they read as operational/status
 * questions rather than pure architecture/design discussion.
 * Kept free of Electron so it can be unit-tested directly.
 */

const OPERATIONAL_KEYWORDS = [
  'incidente', 'incidentes',
  'pipeline', 'pipelines',
  'despliegue', 'deploy', 'deployment',
  'log', 'logs',
  'error de produccion', 'errores de produccion',
  'estado del sistema', 'salud del sistema', 'estado de salud',
  'sprint',
  'tareas asignadas', 'tarea asignada',
  'checkpoint', 'daily checkpoint', 'daily-checkpoint',
  'en que esta trabajando', 'en que anda trabajando',
  'que cambio', 'que cambios', 'ultimos cambios',
  'tiempos de respuesta', 'tiempo de respuesta',
  'riesgo identificado', 'riesgos identificados',
  'optimizacion', 'optimizaciones', 'propuesta de mejora', 'propuestas de mejora',
  'propuesta pendiente', 'propuestas pendientes'
];

const EXPLICIT_COMMAND_PATTERN = /^\/(silia\s+daily|optimizaciones|propuestas|propuesta\s+\d+|incidente)\b/i;

const ACTION_VERBS = [
  'optimiza', 'optimizar',
  'ejecuta', 'ejecutar',
  'corre', 'correr',
  'lanza', 'lanzar',
  'arregla', 'arreglar',
  'despliega', 'desplegar',
  'genera el checkpoint', 'genera un checkpoint', 'genera mi checkpoint'
];

function stripAccents(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(text) {
  return stripAccents(typeof text === 'string' ? text.trim().toLowerCase() : '');
}

/**
 * Classifies free-form chat text typed while "system-design" mode is
 * active, deciding whether it should be routed to Cerebro instead of the
 * regular design-assistant LLM flow.
 *
 * @param {string} text
 * @returns {{isOperational: boolean, isAction: boolean, matchedKeyword: string|null}}
 */
function classifyOperationalQuery(text) {
  const normalized = normalize(text);

  if (!normalized) {
    return { isOperational: false, isAction: false, matchedKeyword: null };
  }

  const matchedActionVerb = ACTION_VERBS.find((verb) => normalized.startsWith(verb));
  if (matchedActionVerb) {
    return { isOperational: true, isAction: true, matchedKeyword: matchedActionVerb };
  }

  const matchedKeyword = OPERATIONAL_KEYWORDS.find((keyword) => normalized.includes(keyword));
  if (matchedKeyword) {
    return { isOperational: true, isAction: false, matchedKeyword };
  }

  return { isOperational: false, isAction: false, matchedKeyword: null };
}

/**
 * True for the explicit Cerebro slash-command syntax (/silia daily,
 * /optimizaciones, /propuestas, /propuesta <id> ..., /incidente ...),
 * regardless of whether it contains an operational keyword. Used so these
 * unambiguous commands still route to Cerebro even when typed in
 * "system-design" mode.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isExplicitCerebroCommand(text) {
  return EXPLICIT_COMMAND_PATTERN.test(typeof text === 'string' ? text.trim() : '');
}

module.exports = { classifyOperationalQuery, isExplicitCerebroCommand };
