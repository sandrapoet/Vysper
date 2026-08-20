/**
 * Pure text-command parsing for the "Silia" mode (/silia daily, /incidente).
 * Kept free of Electron so it can be unit-tested directly.
 */

function normalize(text) {
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * Returns true if the text is the "/silia daily" checkpoint command,
 * with or without a trailing assignee argument (see
 * `parseSiliaDailyArgument`).
 */
function parseSiliaDailyCommand(text) {
  const normalized = normalize(text);
  return /^\/silia\s+daily(?:\s+\S[\s\S]*)?$/i.test(normalized);
}

/**
 * Returns the raw text typed after "/silia daily" (e.g. an email, a Jira
 * issue key, a GitHub PR reference), or null if none was given. Does not
 * interpret what kind of identifier it is — see
 * `resolveDailyCheckpointAssignee` for that.
 */
function parseSiliaDailyArgument(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/silia\s+daily\s+([\s\S]+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Returns the incident description if text is an "/incidente <description>"
 * command, otherwise null.
 */
function parseIncidenteCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/incidente\s+([\s\S]+)$/i);
  if (!match) return null;

  let description = match[1].trim();
  if (description.length >= 2 &&
      ((description.startsWith('"') && description.endsWith('"')) ||
       (description.startsWith('\'') && description.endsWith('\'')))) {
    description = description.slice(1, -1).trim();
  }

  return description.length > 0 ? description : null;
}

/**
 * Returns true if the text is "/optimizaciones" or "/propuestas" — the
 * Sistema de Mejora Continua (SMC) command that lists today's pending
 * optimization proposals.
 */
function parseOptimizacionesCommand(text) {
  return /^\/(optimizaciones|propuestas)$/i.test(normalize(text));
}

/**
 * Returns {id, estado, motivo} if text is a
 * "/propuesta <id> aceptar|rechazar|posponer [motivo]" decision command,
 * otherwise null.
 */
function parsePropuestaDecidirCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/propuesta\s+(\d+)\s+(aceptar|rechazar|posponer)(?:\s+([\s\S]+))?$/i);
  if (!match) return null;

  const estadoMap = { aceptar: 'aceptada', rechazar: 'rechazada', posponer: 'pospuesta' };
  return {
    id: parseInt(match[1], 10),
    estado: estadoMap[match[2].toLowerCase()],
    motivo: (match[3] || '').trim(),
  };
}

/**
 * Returns {sprintRef} if text is "/silia retro" (sprintRef: null, uses the
 * active sprint) or "/silia retro <sprint_ref>" (id, number or name),
 * otherwise null. The project comes from Vysper config
 * (VYSPER_SILIA_DEFAULT_PROJECT), same pattern as "/silia daily"'s
 * assignee — never parsed out of the chat text.
 */
function parseSiliaRetroCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/silia\s+retro(?:\s+(?!comparar\b)([\s\S]+))?$/i);
  if (!match) return null;
  const sprintRef = (match[1] || '').trim();
  return { sprintRef: sprintRef.length > 0 ? sprintRef : null };
}

/**
 * Returns {sprintA, sprintB} if text is
 * "/silia retro comparar <sprint_a> <sprint_b>", otherwise null.
 */
function parseSiliaRetroCompararCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/silia\s+retro\s+comparar\s+(\S+)\s+(\S+)$/i);
  if (!match) return null;
  return { sprintA: match[1], sprintB: match[2] };
}

/**
 * Returns {dominio} if text is "/hoy <dominio>" — the domain risk-review
 * pipeline (analisis de riesgo de actividades de Jira en los sprints
 * vigentes de un dominio) — otherwise null.
 */
function parseHoyCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/hoy\s+([\s\S]+)$/i);
  if (!match) return null;
  const dominio = match[1].trim();
  return dominio.length > 0 ? { dominio } : null;
}

module.exports = {
  parseSiliaDailyCommand,
  parseSiliaDailyArgument,
  parseIncidenteCommand,
  parseOptimizacionesCommand,
  parsePropuestaDecidirCommand,
  parseSiliaRetroCommand,
  parseSiliaRetroCompararCommand,
  parseHoyCommand,
};
