/**
 * Routing decisions for "system-design" mode messages.
 *
 * Hasta 2026-09-23 este modulo decidia SI una consulta merecia llegar a
 * Cerebro, con una lista de palabras clave operativas. La lista nunca podia
 * estar completa: ese dia, 11 consultas seguidas en system-design se
 * respondieron con el LLM generico y ninguna llego a Cerebro -- incluida
 * "como se implementaron los guardrails en el nuevo motor de agente", que un
 * minuto despues, en modo silia, si consulto Jira/GitHub/Notion y respondio
 * con el ticket real. Ahora TODA consulta va a Cerebro (igual que silia) y
 * lo que cambia es el lente: la persona "arquitecto" en vez de "silia".
 *
 * classifyOperationalQuery sobrevive, pero ya no es un porton: solo
 * distingue los pedidos de ACCION, que siguen pidiendo confirmacion antes
 * de correr. Kept free of Electron so it can be unit-tested directly.
 */

const { isUnknownSlashCommand } = require('./silia-commands');

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

const EXPLICIT_COMMAND_PATTERN = /^\/(silia\s+daily|optimizaciones|propuestas|propuesta\s+\d+|incidente|crear-pr|cancelar-pr|aprobar-pr)\b/i;

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

/**
 * La persona de Cerebro con la que responde el modo system-design. No es
 * "silia" (lente de gestion de proyecto) sino "arquitecto" (lente de
 * diseno: mecanismo real, propuesta de implementacion, trade-offs), ver
 * ARQUITECTO_SYSTEM_PROMPT en Cerebro.
 */
const SYSTEM_DESIGN_PERSONA = 'arquitecto';

/**
 * Longitud minima para tratar un texto como consulta. El dictado continuo
 * de una sesion parte la voz en fragmentos ("ok", "sí", "ajá") y sin este
 * piso cada uno lanzaria un subproceso de Cerebro de ~30s.
 */
const MIN_QUERY_LENGTH = 3;

/**
 * Decide que hacer con texto libre escrito o dictado en modo
 * "system-design".
 *
 * Un "/comando-que-no-existe" NO se manda a Cerebro: mandarlo a diagnose
 * lo devolveria redactado por el modelo con pinta de resultado, que es
 * peor que un error visible (mismo criterio que processTextWithSilia).
 * El guardia vive aca dentro, y no como dependencia inyectada, para que
 * ningun llamador pueda olvidarse de pasarlo.
 *
 * @param {string} text
 * @returns {{toCerebro: boolean, persona: string|null, requiresConfirmation: boolean, matchedKeyword: string|null, reason: string|null}}
 */
function routeSystemDesignText(text) {
  const no = (reason) => ({
    toCerebro: false,
    persona: null,
    requiresConfirmation: false,
    matchedKeyword: null,
    reason
  });

  if (typeof text !== 'string' || !text.trim()) {
    return no('empty');
  }

  const trimmed = text.trim();

  if (trimmed.length < MIN_QUERY_LENGTH) {
    return no('too-short');
  }

  if (isUnknownSlashCommand(trimmed)) {
    return no('unknown-command');
  }

  const classification = classifyOperationalQuery(trimmed);

  return {
    toCerebro: true,
    persona: SYSTEM_DESIGN_PERSONA,
    requiresConfirmation: classification.isAction,
    matchedKeyword: classification.matchedKeyword,
    reason: null
  };
}

module.exports = {
  classifyOperationalQuery,
  isExplicitCerebroCommand,
  routeSystemDesignText,
  SYSTEM_DESIGN_PERSONA,
  MIN_QUERY_LENGTH
};
