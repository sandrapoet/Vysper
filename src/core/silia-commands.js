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

const CREAR_PR_BOOL_FLAGS = { '--draft': true, '--publish': false };

/**
 * Shell-like tokenizer: splits on whitespace, but a double-quoted span
 * (which MAY itself contain whitespace, e.g. `--labels "foundations, AGE-143"`)
 * is kept together as one token with the quotes stripped. A naive
 * `text.split(/\s+/)` would instead break that value at the internal
 * space -- confirmed live: `--labels "foundations, AGE-143"` produced the
 * bogus token `AGE-143"` afterwards, which then failed as an "unknown
 * flag" since the parser had no more `--labels`/etc. to attach it to.
 */
function _tokenizeQuoted(text) {
  const tokens = [];
  const re = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    tokens.push(match[1] !== undefined ? match[1] : match[2]);
  }
  return tokens;
}

/**
 * Returns {rama, draft, labels, ticket, base, repoDir} if text is
 * "/crear-pr <rama> [--draft|--publish] [--labels a,b,c] [--ticket AGE-123]
 * [--base <rama>] [--repo-dir <path>]", or {error} if a flag is unknown or
 * a value-flag is missing its value. Otherwise null.
 * `labels` defaults to [] (no labels) -- unlike Cerebro's own CLI, Vysper
 * NEVER leaves labels unspecified: the interactive "LLM proposes, user
 * picks in the console" flow that `crear-pr` falls back to when --labels
 * is omitted has nowhere to render in a chat, so CerebroService.runCrearPr
 * always passes --labels explicitly (see its comment for how it encodes
 * "no labels" without triggering that fallback).
 * `base`/`repoDir` default to null (Cerebro CLI's own defaults: base =
 * PR_REVIEW_REFERENCE_BRANCH, repo-dir = cwd of the Cerebro process --
 * which is CEREBRO_PATH, NOT the user's target repo, so `--repo-dir` is
 * normally required in real usage; see CerebroService.runCrearPr).
 */
function parseCrearPrCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/crear-pr\s+(\S+)([\s\S]*)$/i);
  if (!match) return null;

  const rama = match[1];
  const rest = match[2].trim();
  const tokens = rest.length ? _tokenizeQuoted(rest) : [];

  let draft = true;
  let labels = [];
  let ticket = null;
  let base = null;
  let repoDir = null;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(CREAR_PR_BOOL_FLAGS, lower)) {
      draft = CREAR_PR_BOOL_FLAGS[lower];
      i += 1;
      continue;
    }
    if (lower === '--labels') {
      const value = tokens[i + 1];
      if (!value) return { error: 'Falta el valor de --labels (ej. --labels bug-fix,backend).' };
      labels = value.split(',').map((l) => l.trim()).filter(Boolean);
      i += 2;
      continue;
    }
    if (lower === '--ticket') {
      const value = tokens[i + 1];
      if (!value) return { error: 'Falta el valor de --ticket (ej. --ticket AGE-123).' };
      ticket = value;
      i += 2;
      continue;
    }
    if (lower === '--base') {
      const value = tokens[i + 1];
      if (!value) return { error: 'Falta el valor de --base (ej. --base develop).' };
      base = value;
      i += 2;
      continue;
    }
    if (lower === '--repo-dir') {
      const value = tokens[i + 1];
      if (!value) return { error: 'Falta el valor de --repo-dir (ej. --repo-dir /ruta/al/repo).' };
      repoDir = value;
      i += 2;
      continue;
    }
    return { error: `Flag desconocido: ${token}` };
  }

  return { rama, draft, labels, ticket, base, repoDir };
}

/**
 * Returns {url} if text is "/cancelar-pr <url-pr>", otherwise null.
 */
function parseCancelarPrCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/cancelar-pr\s+(\S+)\s*$/i);
  return match ? { url: match[1] } : null;
}

const APROBAR_PR_KNOWN_FLAGS = ['--revisar', '--merge', '--tag'];

/**
 * Returns {url, revisar, merge, tag} if text is "/aprobar-pr <url-pr>
 * [--revisar] [--merge] [--tag]", or {error} on an unknown flag. Otherwise
 * null. --merge/--tag never mergean/taguean directamente desde este
 * parseo -- ver runAprobarPrCommand/resolvePendingPrApproval en main.js
 * para el turno de confirmacion explicita en el chat que exige antes.
 */
function parseAprobarPrCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/aprobar-pr\s+(\S+)((?:\s+--\S+)*)\s*$/i);
  if (!match) return null;

  const url = match[1];
  const flagsRaw = (match[2] || '').trim();
  const flags = flagsRaw.length ? flagsRaw.split(/\s+/).map((f) => f.toLowerCase()) : [];

  const unknownFlags = flags.filter((f) => !APROBAR_PR_KNOWN_FLAGS.includes(f));
  if (unknownFlags.length > 0) {
    return { error: `Flag desconocido: ${unknownFlags[0]}` };
  }

  return {
    url,
    revisar: flags.includes('--revisar'),
    merge: flags.includes('--merge'),
    tag: flags.includes('--tag'),
  };
}

/**
 * Returns {texto} if text is "/actualizar-jira <texto libre>" -- todo lo
 * que sigue al comando viaja tal cual (sin flags, sin tokenizar) como el
 * cuerpo de correcciones/decisiones a analizar, ya que puede mencionar
 * varios tickets a la vez (ver Orchestrator.run_actualizar_jira en
 * Cerebro). {error} si no hay texto despues del comando. Otherwise null.
 * NUNCA escribe nada en Jira por si solo -- ver runActualizarJiraCommand/
 * resolvePendingJiraUpdate en main.js para el preview + confirmacion
 * explicita que exige antes de aplicar cualquier cambio.
 */
function parseActualizarJiraCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/actualizar-jira(?:\s+([\s\S]+))?$/i);
  if (!match) return null;

  const texto = (match[1] || '').trim();
  if (!texto) return { error: 'Falta el texto de correcciones para /actualizar-jira.' };
  return { texto };
}

/**
 * Returns {numero, repo} if text is "/merge <numero-pr> --repo
 * <owner/repo> [--merge]", {error} si falta --repo o el formato no calza,
 * o null si el texto no empieza con "/merge". Comando de merge PURO via
 * GitHub API (PUT /pulls/{n}/merge) -- sin aprobar el PR, sin correr
 * /revisar, sin transicionar Jira (para ese pipeline completo ver
 * /aprobar-pr --merge). El "--merge" final es opcional, solo calca la
 * sintaxis de `gh pr merge <n> --repo x --merge`. NUNCA mergea directo --
 * ver runMergeCommand/resolvePendingMerge en main.js para el turno de
 * confirmacion explicita que exige antes.
 */
function parseMergeCommand(text) {
  const normalized = normalize(text);
  if (!/^\/merge\b/i.test(normalized)) return null;

  const match = normalized.match(/^\/merge\s+(\d+)\s+--repo\s+(\S+)(?:\s+--merge)?\s*$/i);
  if (!match) {
    return { error: 'Uso: /merge <numero-pr> --repo <owner/repo>' };
  }
  return { numero: parseInt(match[1], 10), repo: match[2] };
}

/**
 * Returns {folderPath} if text is "/contexto <ruta-carpeta>" -- el unico
 * parametro es la carpeta cuyo contenido (archivos .md/.txt/.json de primer
 * nivel, sin recursividad) se debe cargar como contexto persistente para la
 * evaluacion/conversacion en curso del modo dsa. {error} si no se dio ruta.
 * Otherwise null. La ruta viaja tal cual (sin tokenizar, como
 * /actualizar-jira) para admitir carpetas con espacios sin comillas.
 */
function parseContextoCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/contexto(?:\s+([\s\S]+))?$/i);
  if (!match) return null;

  const folderPath = (match[1] || '').trim();
  if (!folderPath) return { error: 'Uso: /contexto <ruta-carpeta>' };
  return { folderPath };
}

/**
 * Returns true if text is exactly "/script" (sin argumentos -- el comando
 * SIEMPRE ejecuta el mismo script fijo del lado de Cerebro, ver
 * _SCRIPT_PATH en cerebro/cli.py; no acepta nombre para que nunca se
 * pueda pedir ejecutar un .py arbitrario desde el chat).
 */
function parseScriptCommand(text) {
  const normalized = normalize(text);
  return /^\/script\s*$/i.test(normalized);
}

const CONFIRMATION_YES = ['si', 'sí', 'yes', 'confirmo', 'confirmar', 'dale', 'ok', 'okay', 'adelante'];
const CONFIRMATION_NO = ['no', 'cancelar', 'cancela', 'cancelo', 'nel'];

/**
 * Classifies a chat reply as an affirmative (true) or negative (false)
 * answer to a pending yes/no confirmation (e.g. /aprobar-pr --merge's
 * chat-level confirmation, see resolvePendingPrApproval in main.js), or
 * null if it doesn't read as either -- callers treat null as "not a
 * confirmation reply" and drop the pending confirmation rather than
 * guessing.
 */
function parseConfirmationResponse(text) {
  const normalized = normalize(text).toLowerCase().replace(/[¡!¿?.]/g, '').trim();
  if (!normalized) return null;
  if (CONFIRMATION_YES.includes(normalized)) return true;
  if (CONFIRMATION_NO.includes(normalized)) return false;
  return null;
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
  parseCrearPrCommand,
  parseCancelarPrCommand,
  parseAprobarPrCommand,
  parseActualizarJiraCommand,
  parseScriptCommand,
  parseMergeCommand,
  parseConfirmationResponse,
  parseContextoCommand,
};
