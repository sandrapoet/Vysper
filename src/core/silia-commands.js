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

/**
 * Returns {dominio} if text is "/detalle [dominio]" — dumps the /hoy
 * domain-risk-review already persisted in SQLite to a .md file (never
 * re-runs Jira/LLM). `dominio` is optional: null means "the most recent
 * review across any domain" (see CerebroService.runDetalle).
 */
function parseDetalleCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/detalle(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  const dominio = (match[1] || '').trim();
  return { dominio: dominio.length > 0 ? dominio : null };
}

// Tools Cerebro can scope a free-form query to (see
// TOOL_DESCRIPTIONS in cerebro/prompts/system_prompt.py — the prefix
// before "_" for every LLM-facing tool). Keeping this list explicit (not
// derived) means an unsupported name like "/confluence" falls through to
// the normal free-form dispatch instead of silently matching nothing.
const SCOPED_TOOLS = ['jira', 'notion', 'github'];

/**
 * Returns {tool, query} if text is "/jira <query>", "/notion <query>" or
 * "/github <query>" — a user-chosen scope that restricts Cerebro's tool
 * loop to only that source (see Orchestrator.run's tool_filter), instead
 * of letting the LLM pick which tool/scope to use on its own. Otherwise
 * null. Case-insensitive on the command name; the query is used as-is.
 */
function parseToolScopedCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/(\w+)\s+([\s\S]+)$/i);
  if (!match) return null;
  const tool = match[1].toLowerCase();
  if (!SCOPED_TOOLS.includes(tool)) return null;
  const query = match[2].trim();
  return query.length > 0 ? { tool, query } : null;
}

const REVISAR_DEPTH_FLAGS = ['--profundo', '--arq', '--security'];
const REVISAR_KNOWN_FLAGS = [...REVISAR_DEPTH_FLAGS, '--diablo', '--merge', '--release'];

/**
 * Returns {url, mode, diablo, merge, release} if text is
 * "/revisar <url> [--profundo|--arq|--security] [--diablo] [--merge]
 * [--release]", or {error} if flags of profundidad se combinan o hay un
 * flag desconocido (nunca silencioso). Otherwise null. `mode` is one of
 * 'basico'|'profundo'|'arq'|'security' — 'basico' (sin flags) es solo
 * conflictos+formato, sin la matriz de cumplimiento completa (ver
 * CerebroService.runRevisar / Orchestrator.run_pr_review).
 */
function parseRevisarCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/revisar\s+(\S+)((?:\s+--\S+)*)\s*$/i);
  if (!match) return null;

  const url = match[1];
  const flagsRaw = (match[2] || '').trim();
  const flags = flagsRaw.length ? flagsRaw.split(/\s+/).map((f) => f.toLowerCase()) : [];

  const unknownFlags = flags.filter((f) => !REVISAR_KNOWN_FLAGS.includes(f));
  if (unknownFlags.length > 0) {
    return { error: `Flag desconocido: ${unknownFlags[0]}` };
  }

  const depthFlags = flags.filter((f) => REVISAR_DEPTH_FLAGS.includes(f));
  if (depthFlags.length > 1) {
    return { error: 'Usa como maximo un modo de profundidad: --profundo, --arq o --security.' };
  }

  return {
    url,
    mode: depthFlags.length ? depthFlags[0].replace('--', '') : 'basico',
    diablo: flags.includes('--diablo'),
    merge: flags.includes('--merge'),
    release: flags.includes('--release'),
  };
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
  parseDetalleCommand,
  parseToolScopedCommand,
  SCOPED_TOOLS,
  parseRevisarCommand,
};
