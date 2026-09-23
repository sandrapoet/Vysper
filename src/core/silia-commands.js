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
 * If `rest` starts with "--dominio <valor>", strips it and returns
 * {dominio: valor, rest: <lo que queda>}; otherwise {dominio: null, rest}
 * unchanged. Shared by parseSiliaRetroCommand and
 * parseSiliaRetroCompararCommand so "--dominio" can appear before either
 * a bare sprint_ref or "comparar <a> <b>".
 */
function _extractRetroDominio(rest) {
  const match = rest.match(/^--dominio\s+(\S+)\s*/i);
  if (!match) return { dominio: null, rest };
  return { dominio: match[1], rest: rest.slice(match[0].length).trim() };
}

/**
 * Returns {sprintRef, dominio} if text is "/silia retro [--dominio
 * <alias>] [sprint_ref]" (sprintRef: null if omitted, uses the active
 * sprint; id, number or name otherwise), otherwise null. `dominio` is
 * null unless "--dominio <alias>" is given, in which case it overrides
 * the project for this one call — resolved against equiv.yaml
 * (dominios:) on the Cerebro side, same alias set as "/hoy <dominio>".
 * Without "--dominio", the project comes from Vysper config
 * (VYSPER_SILIA_DEFAULT_PROJECT), same pattern as "/silia daily"'s
 * assignee — never parsed out of the chat text.
 */
function parseSiliaRetroCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/silia\s+retro(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  const { dominio, rest } = _extractRetroDominio((match[1] || '').trim());
  if (/^comparar\b/i.test(rest)) return null;
  return { sprintRef: rest.length > 0 ? rest : null, dominio };
}

/**
 * Returns {sprintA, sprintB, dominio} if text is "/silia retro [--dominio
 * <alias>] comparar <sprint_a> <sprint_b>", otherwise null.
 */
function parseSiliaRetroCompararCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/silia\s+retro\s+([\s\S]+)$/i);
  if (!match) return null;
  const { dominio, rest } = _extractRetroDominio(match[1].trim());
  const compararMatch = rest.match(/^comparar\s+(\S+)\s+(\S+)$/i);
  if (!compararMatch) return null;
  return { sprintA: compararMatch[1], sprintB: compararMatch[2], dominio };
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

// '--basico' vive aqui, junto a los modos de profundidad, porque comparte su
// regla: es un MODO, y elegir dos modos a la vez es un error, no una
// combinacion. Dejo de ser el default (ver parseRevisarCommand) -- ahora
// /revisar sin flags corre la auditoria completa.
const REVISAR_DEPTH_FLAGS = ['--basico', '--profundo', '--arq', '--security'];
const REVISAR_KNOWN_FLAGS = [...REVISAR_DEPTH_FLAGS, '--diablo', '--merge', '--release', '--force'];

/**
 * Returns {url, mode, diablo, merge, release, force} if text is
 * "/revisar <url> [--basico|--profundo|--arq|--security] [--diablo] [--merge]
 * [--release] [--force]", or {error} if dos modos se combinan o hay un flag
 * desconocido (nunca silencioso). Otherwise null. `mode` is one of
 * 'silia'|'basico'|'profundo'|'arq'|'security'.
 *
 * SIN FLAGS el modo es 'silia': la auditoria completa (matriz de
 * cumplimiento + el checklist de 12 dimensiones con severidades +
 * OpenSpec/Jira), el algoritmo de la skill silia-review-pr. Antes el
 * default era 'basico' — solo titulo y ticket, sin LLM — asi que la forma
 * MAS USADA del comando, aqui y en el menu de Termux, era tambien la mas
 * debil. 'basico' sigue disponible con --basico (ver
 * CerebroService.runRevisar / Orchestrator.run_pr_review). `force` ignora
 * la revision cacheada para el sha actual y re-evalua desde cero -- util
 * cuando el reporte cacheado quedo desactualizado aunque el PR siga en el
 * mismo commit.
 *
 * "/revisar-merge <url>" se acepta como ALIAS de "/revisar <url> --merge".
 * El merge ya era alcanzable desde el chat, pero solo escribiendo el flag:
 * quien conocia el subcomando `revisar-merge` de la CLI y lo tipeaba tal
 * cual no obtenia un error, obtenia una respuesta del LLM (ver
 * isUnknownSlashCommand). El alias existe para que deje de ser una sorpresa,
 * y como MERGEA, va por este parser y no por el passthrough de solo lectura.
 */
function parseRevisarCommand(text) {
  const normalized = normalize(text);
  const alias = /^\/revisar-merge(\s|$)/i.test(normalized);
  const match = alias
    ? normalized.match(/^\/revisar-merge\s+(\S+)((?:\s+--\S+)*)\s*$/i)
    : normalized.match(/^\/revisar\s+(\S+)((?:\s+--\S+)*)\s*$/i);
  if (!match) {
    // "/revisar-merge" sin url matchea el alias pero no el formato: decirlo
    // es mejor que devolver null y que caiga como comando desconocido.
    return alias ? { error: 'Falta la url del PR (ej. /revisar-merge <url-pr>).' } : null;
  }

  const url = match[1];
  const flagsRaw = (match[2] || '').trim();
  const flags = flagsRaw.length ? flagsRaw.split(/\s+/).map((f) => f.toLowerCase()) : [];
  if (alias && !flags.includes('--merge')) flags.push('--merge');

  const unknownFlags = flags.filter((f) => !REVISAR_KNOWN_FLAGS.includes(f));
  if (unknownFlags.length > 0) {
    return { error: `Flag desconocido: ${unknownFlags[0]}` };
  }

  const depthFlags = flags.filter((f) => REVISAR_DEPTH_FLAGS.includes(f));
  if (depthFlags.length > 1) {
    return { error: 'Usa como maximo un modo: --basico, --profundo, --arq o --security.' };
  }

  return {
    url,
    mode: depthFlags.length ? depthFlags[0].replace('--', '') : 'silia',
    diablo: flags.includes('--diablo'),
    merge: flags.includes('--merge'),
    release: flags.includes('--release'),
    force: flags.includes('--force'),
  };
}

/**
 * "/audit [repo]" -- la skill silia-audit-pr sobre el arbol LOCAL de la PC.
 *
 * Sin argumento usa el unico repo configurado en MERGE_GATE_REPO_DIRS;
 * Cerebro decide, no este parser, porque la lista vive en su .env.
 *
 * NO lleva url: es justo lo contrario de /revisar. Aquel mira el PR de otra
 * persona, este mira el trabajo tuyo que TODAVIA no es un PR -- cambios sin
 * commitear incluidos. Si alguien le pasa una url, decirselo es mejor que
 * tratarla como nombre de repo y auditar el que no era.
 */
function parseAuditCommand(text) {
  const normalized = normalize(text);
  if (!/^\/audit(\s|$)/i.test(normalized)) return null;

  const match = normalized.match(/^\/audit(?:\s+(\S+))?\s*$/i);
  if (!match) {
    return { error: 'Uso: /audit [owner/repo]. No lleva url: audita tu arbol local.' };
  }

  const argumento = match[1] || '';
  if (/^https?:\/\//i.test(argumento)) {
    return {
      error:
        '/audit no lleva url -- audita TU trabajo local, antes del PR. ' +
        'Para revisar un PR abierto es /revisar <url>.',
    };
  }
  return { repo: argumento };
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
 * Junta el valor de un flag que acepta una LISTA separada por comas, aunque
 * el usuario haya puesto espacios despues de las comas y sin comillas:
 * `--ticket AGE-233, AGE-234, AGE-236`.
 *
 * Sin esto, _tokenizeQuoted parte eso en `AGE-233,` `AGE-234,` `AGE-236` y el
 * parser tomaba solo el primero -- los otros dos caian como "flag
 * desconocido". Escribir comillas es lo que habia que recordar, y en un chat
 * que se usa manejando eso no pasa.
 *
 * Se sigue acumulando mientras el token actual termine en coma o el siguiente
 * empiece con coma. Un token que empieza con `--` corta siempre: es el
 * proximo flag, no parte del valor.
 *
 * Devuelve {value, next} o null si no hay valor.
 */
function _collectCommaValue(tokens, start) {
  if (start >= tokens.length || tokens[start].startsWith('--')) return null;
  const partes = [tokens[start]];
  let i = start;
  while (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')
    && (partes[partes.length - 1].endsWith(',') || tokens[i + 1].startsWith(','))) {
    partes.push(tokens[i + 1]);
    i += 1;
  }
  return { value: partes.join(' '), next: i + 1 };
}

function _splitList(value) {
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/**
 * Returns {rama, draft, labels, tickets, base, repoDir} if text is
 * "/crear-pr <rama> [--draft|--publish] [--labels a,b,c]
 * [--ticket AGE-123, AGE-124] [--base <rama>] [--repo-dir <path>]", or
 * {error} if a flag is unknown or a value-flag is missing its value.
 * Otherwise null.
 * `tickets` es una LISTA (default []): un PR puede cubrir varios y Cerebro
 * los transiciona todos. Se escriben separados por coma en un solo --ticket,
 * con o sin espacios y sin necesidad de comillas (ver _collectCommaValue).
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
  let tickets = [];
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
      const collected = _collectCommaValue(tokens, i + 1);
      if (!collected) return { error: 'Falta el valor de --labels (ej. --labels bug-fix,backend).' };
      labels = _splitList(collected.value);
      i = collected.next;
      continue;
    }
    if (lower === '--ticket') {
      // Acepta varios: `--ticket AGE-233, AGE-234, AGE-236`. Un PR puede
      // cubrir mas de un ticket y Cerebro los transiciona todos.
      const collected = _collectCommaValue(tokens, i + 1);
      if (!collected) return { error: 'Falta el valor de --ticket (ej. --ticket AGE-123, AGE-124).' };
      tickets = _splitList(collected.value);
      i = collected.next;
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

  return { rama, draft, labels, tickets, base, repoDir };
}

/**
 * Returns {url} if text is "/cancelar-pr <url-pr>", otherwise null.
 */
function parseCancelarPrCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/cancelar-pr\s+(\S+)\s*$/i);
  return match ? { url: match[1] } : null;
}

const APROBAR_PR_BOOL_FLAGS = ['--revisar', '--merge', '--tag'];

/**
 * Junta TODO lo que sigue hasta el proximo `--flag`, unido por espacios.
 *
 * Es mas goloso que _collectCommaValue a proposito, y solo sirve donde el
 * valor es el ultimo campo libre: los nombres de checks llevan espacios y
 * ampersands ("Lint & Format Check", "Adversarial Verify (shadow)"), asi
 * que la heuristica de "acumula mientras haya comas" corta en "Lint" y
 * pierde el resto. Ningun nombre de check empieza con `--`, asi que el
 * proximo flag es un corte seguro.
 *
 * Devuelve {value, next} o null si no hay valor.
 */
function _collectUntilNextFlag(tokens, start) {
  if (start >= tokens.length || tokens[start].startsWith('--')) return null;
  let i = start;
  while (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) i += 1;
  return { value: tokens.slice(start, i + 1).join(' '), next: i + 1 };
}

/**
 * Returns {url, revisar, merge, tag, ignorarChecks} if text is
 * "/aprobar-pr <url-pr> [--revisar] [--merge] [--tag]
 * [--ignorar-checks "a,b"]", or {error} on an unknown flag / un flag de
 * valor sin valor. Otherwise null.
 *
 * --merge/--tag never mergean/taguean directamente desde este parseo --
 * ver runAprobarPrCommand/resolvePendingPrApproval en main.js para el
 * turno de confirmacion explicita en el chat que exige antes.
 *
 * `ignorarChecks` es una LISTA (default []) de nombres de checks NO
 * requeridos a descontar. Existe aqui porque el gate de Cerebro, cuando
 * bloquea, devuelve la linea ya armada (`sugerencia`) con los nombres
 * exactos -- y sin este flag esa linea no se podia pegar desde el chat: el
 * parser la rechazaba como "flag desconocido", asi que desde el celular la
 * unica salida era el flag EN BLOQUE, que es justo el que se traga los
 * rojos que nadie miro. Se acepta con comillas o sin ellas: los nombres
 * llevan espacios, y escribir comillas manejando no pasa.
 */
function parseAprobarPrCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/aprobar-pr\s+(\S+)([\s\S]*)$/i);
  if (!match) return null;

  const url = match[1];
  const rest = match[2].trim();
  const tokens = rest.length ? _tokenizeQuoted(rest) : [];

  const bools = new Set();
  let ignorarChecks = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    if (APROBAR_PR_BOOL_FLAGS.includes(lower)) {
      bools.add(lower);
      i += 1;
      continue;
    }
    if (lower === '--ignorar-checks') {
      const collected = _collectUntilNextFlag(tokens, i + 1);
      if (!collected) {
        return { error: 'Falta el valor de --ignorar-checks (ej. --ignorar-checks "Lint & Format Check").' };
      }
      ignorarChecks = _splitList(collected.value);
      i = collected.next;
      continue;
    }
    return { error: `Flag desconocido: ${token}` };
  }

  return {
    url,
    revisar: bools.has('--revisar'),
    merge: bools.has('--merge'),
    tag: bools.has('--tag'),
    ignorarChecks,
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

const CREAR_TICKET_VALUE_FLAGS = {
  '--proyecto': 'proyecto',
  '--tipo': 'tipo',
  '--resumen': 'resumen',
  '--padre': 'padre',
  '--sprint': 'sprint',
  '--asignado-a': 'asignadoA',
  '--fecha-limite': 'fechaLimite',
  '--story-points': 'storyPoints',
  '--descripcion-archivo': 'descripcionArchivo',
};

/**
 * Returns {proyecto, tipo, resumen, descripcion, descripcionArchivo, padre,
 * sprint, links, ...} para "/crear-ticket <flags> [--descripcion <texto>]",
 * {error} si un flag es desconocido o le falta el valor, o null si el texto
 * no empieza con /crear-ticket.
 *
 * `--descripcion` es GOLOSO HASTA EL FINAL del mensaje y por eso tiene que ir
 * ULTIMO: la descripcion de un hallazgo son decenas de lineas con bloques de
 * codigo y checklists, y cortarla en el proximo token que empiece con "--"
 * la partiria en cualquier lista de markdown. Todo lo que sigue viaja
 * verbatim -- que es el punto del comando: al copiar a mano un hallazgo con
 * evidencia medida, lo que se pierde es justo el detalle.
 *
 * `--descripcion-archivo` sigue disponible, pero apunta a una ruta de la PC
 * (donde corre Cerebro), no del telefono.
 *
 * NUNCA crea nada por si solo -- ver runCrearTicketCommand/
 * resolvePendingTicketCreation en main.js para el preview + confirmacion
 * explicita que exige antes de escribir en Jira.
 */
function parseCrearTicketCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/crear-ticket(?:\s+([\s\S]+))?$/i);
  if (!match) return null;

  const rest = (match[1] || '').trim();
  if (!rest) return { error: 'Falta al menos --resumen y --proyecto para /crear-ticket.' };

  // Se parte por --descripcion ANTES de tokenizar: lo que sigue no son
  // tokens, es un texto que no se toca.
  const corte = rest.match(/(^|\s)--descripcion(\s|$)/i);
  let descripcion = null;
  let cabecera = rest;
  if (corte) {
    cabecera = rest.slice(0, corte.index).trim();
    descripcion = rest.slice(corte.index + corte[0].length).trim() || null;
    if (!descripcion) return { error: 'Falta el texto despues de --descripcion.' };
  }

  const tokens = cabecera.length ? _tokenizeQuoted(cabecera) : [];
  const resultado = {
    proyecto: null, tipo: null, resumen: null, descripcion, descripcionArchivo: null,
    padre: null, sprint: null, asignadoA: null, fechaLimite: null, storyPoints: null,
    links: [],
  };

  let i = 0;
  while (i < tokens.length) {
    const lower = tokens[i].toLowerCase();
    if (lower === '--link') {
      const collected = _collectUntilNextFlag(tokens, i + 1);
      if (!collected) return { error: 'Falta el valor de --link (ej. --link "bloquea:AGE-219").' };
      resultado.links.push(collected.value);
      i = collected.next;
      continue;
    }
    const campo = CREAR_TICKET_VALUE_FLAGS[lower];
    if (campo) {
      const collected = _collectUntilNextFlag(tokens, i + 1);
      if (!collected) return { error: `Falta el valor de ${lower}.` };
      resultado[campo] = collected.value;
      i = collected.next;
      continue;
    }
    return { error: `Flag desconocido: ${tokens[i]}` };
  }

  if (!resultado.resumen) return { error: 'Falta --resumen para /crear-ticket.' };
  if (!resultado.descripcion && !resultado.descripcionArchivo) {
    return { error: 'Falta la descripcion: usa --descripcion <texto> (al final) o --descripcion-archivo <ruta>.' };
  }
  return resultado;
}

/**
 * Comandos de SOLO LECTURA de la CLI de Cerebro, alcanzables desde el chat
 * (y por lo tanto desde el celular) por una ruta GENERICA: se agregan aqui y
 * quedan disponibles sin escribir un parser, un metodo del servicio y una
 * rama del dispatch para cada uno.
 *
 * Ese costo por comando es la razon de que `auditar-bump` naciera fuera del
 * alcance del telefono el mismo dia que se agrego a la CLI: un comando que
 * existe en Cerebro y no en Vysper es un comando que no se tiene la mitad
 * del tiempo, y hasta ahora ni siquiera fallaba -- caia en `diagnose` y
 * volvia una respuesta del LLM con pinta de resultado (ver el fallback de
 * processTextWithSilia en main.js).
 *
 * SOLO lectura, y eso no es una formalidad. Un comando que ESCRIBE
 * (revisar-merge, aprobar-pr, actualizar-jira, crear-ticket) no entra aca
 * nunca: necesita el flujo de confirmacion de dos turnos, que vive en Vysper
 * y no en la CLI. Ademas, un subcomando que caiga en typer.confirm() cuelga
 * el subproceso -- que no tiene stdin real -- hasta el timeout.
 *
 * Los cinco de abajo son de lectura verificable: auditar-bump solo hace GETs
 * a GitHub; estado-llm a proposito no hace llamadas reales al modelo;
 * preflight-promocion declara que NO crea la rama ni abre el PR (solo un
 * worktree local descartable); hoy-historial/hoy-comparar solo leen SQLite.
 */
const PASSTHROUGH_COMMANDS = {
  'auditar-bump': { minArgs: 1, ejemplo: '/auditar-bump <url-pr>' },
  // Lee una fila de SQLite y no escribe nada: es como el celular pregunta
  // por un /revisar que dejo corriendo. Sin el, un trabajo de 6-20 minutos
  // no tendria forma de entregarse -- Termux abre su request y se va, y no
  // hay canal de push hacia el telefono.
  'revisar-estado': { minArgs: 1, ejemplo: '/revisar-estado <job-id>' },
  'audit-estado': { minArgs: 1, ejemplo: '/audit-estado <job-id>' },
  'estado-llm': { minArgs: 0, ejemplo: '/estado-llm' },
  'preflight-promocion': { minArgs: 1, ejemplo: '/preflight-promocion AGE-245' },
  'hoy-historial': { minArgs: 1, ejemplo: '/hoy-historial <dominio>' },
  'hoy-comparar': { minArgs: 1, ejemplo: '/hoy-comparar <dominio>' },
};

/**
 * Flags que NUNCA cruzan el tunel, venga como venga el comando.
 *
 * PASSTHROUGH_COMMANDS ya acota que se puede correr; esto es la red por si
 * manana entra ahi algo que resulta no ser tan de lectura. Cada uno tiene su
 * motivo:
 *   --confirmar / --confirmar-deploy / --disparar-deploy: la confirmacion se
 *     da en el chat, en un segundo turno. Un flag que la de por hecha se
 *     saltaria esa pregunta entera.
 *   --plan / --plan-hash: son el mecanismo de integridad de las dos fases;
 *     los arma Vysper a partir del preview, no se tipean.
 *   --ignorar-checks-no-requeridos: en el chat no se ve la lista de rojos de
 *     un vistazo como en la web de GitHub, asi que un "ignoralos todos" desde
 *     el telefono es aun mas ciego que desde la terminal. La version acotada
 *     (--ignorar-checks "a,b") si esta disponible.
 */
const FLAGS_PROHIBIDOS_EN_EL_TUNEL = [
  '--confirmar',
  '--confirmar-deploy',
  '--disparar-deploy',
  '--plan',
  '--plan-hash',
  '--ignorar-checks-no-requeridos',
];

/**
 * Returns {cli, args} si `text` es uno de PASSTHROUGH_COMMANDS, {error} si
 * lo es pero le faltan argumentos o trae un flag prohibido, o null si no es
 * ninguno de ellos.
 *
 * Los flags que NO estan prohibidos viajan TAL CUAL, incluidos los que
 * Vysper no conoce: ese es el punto. La CLI de Cerebro es la unica que los
 * valida, asi que un flag nuevo alla queda disponible aqui el mismo dia, sin
 * tocar este archivo.
 */
function parsePassthroughCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]+))?$/i);
  if (!match) return null;

  const nombre = match[1].toLowerCase();
  const spec = PASSTHROUGH_COMMANDS[nombre];
  if (!spec) return null;

  const args = match[2] ? _tokenizeQuoted(match[2].trim()) : [];
  const prohibido = args.find((a) => FLAGS_PROHIBIDOS_EN_EL_TUNEL.includes(a.toLowerCase()));
  if (prohibido) {
    return { error: `El flag ${prohibido} no se puede usar desde el chat. Córrelo desde la terminal.` };
  }

  const posicionales = args.filter((a) => !a.startsWith('--'));
  if (posicionales.length < spec.minArgs) {
    return { error: `Falta(n) argumento(s) para /${nombre} (ej. ${spec.ejemplo}).` };
  }
  return { cli: nombre, args };
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

// Debe coincidir con el array que usa navigateSkill() en main.js para ciclar
// skills con el atajo Ctrl/Cmd+Arriba/Abajo -- son los unicos nombres validos
// para /modo.
const VALID_SKILLS = [
  'programming', 'dsa', 'system-design', 'behavioral',
  'secretaria', 'silia', 'labelling', 'traductor',
];

/**
 * Returns the target skill name if text is "/modo <skill>", or {error} if
 * el skill no es uno de VALID_SKILLS. Otherwise null. A diferencia de
 * /revisar, /hoy, etc., este comando debe reconocerse y ejecutarse sin
 * importar el skill activo -- si no, no habria forma de cambiar A silia
 * por control remoto cuando la PC esta en otro modo (el problema del huevo
 * y la gallina que /modo existe justamente para resolver).
 */
function parseModoCommand(text) {
  const normalized = normalize(text);
  const match = normalized.match(/^\/modo\s+(\S+)\s*$/i);
  if (!match) return null;

  const skill = match[1].toLowerCase();
  if (!VALID_SKILLS.includes(skill)) {
    return { error: `Skill desconocido: ${skill}. Validos: ${VALID_SKILLS.join(', ')}` };
  }
  return { skill };
}

// Todos los parsers de comandos de ESTE modulo, para poder preguntar
// "¿alguien reconoce este texto?" sin volver a enumerarlos en cada lugar
// que lo necesite. No existia un catalogo asi: estaba repartido entre este
// archivo, cerebro-query-router.js y el orden de los if de main.js, y esa
// dispersion es la razon de que agregar un comando cueste cinco ediciones.
//
// Los parsers que devuelven boolean se normalizan a null/true: `false !==
// null` los daria por reconocidos a todos.
const KNOWN_COMMAND_PARSERS = [
  (t) => (parseSiliaDailyCommand(t) ? true : null),
  (t) => (parseOptimizacionesCommand(t) ? true : null),
  (t) => (parseScriptCommand(t) ? true : null),
  parseIncidenteCommand,
  parsePropuestaDecidirCommand,
  parseSiliaRetroCompararCommand,
  parseSiliaRetroCommand,
  parseHoyCommand,
  parseDetalleCommand,
  parseToolScopedCommand,
  parseRevisarCommand,
  parseAuditCommand,
  parseCrearPrCommand,
  parseCancelarPrCommand,
  parseAprobarPrCommand,
  parseActualizarJiraCommand,
  parseCrearTicketCommand,
  parsePassthroughCommand,
  parseMergeCommand,
  parseContextoCommand,
  parseModoCommand,
];

// Comandos que maneja main.js con parsers que NO viven en este modulo
// (/actualizaRag, los de modo secretaria, /optimiza de system-design). El
// dispatch los atiende ANTES de llegar a processTextWithSilia, asi que en
// la practica no llegarian aca -- se listan igual para que reordenar el
// dispatch no los convierta en "comando desconocido" por accidente.
const COMANDOS_DE_OTROS_MODULOS = [
  '/actualizarag', '/optimiza', '/reconocervoz', '/reconocervozpendientes',
  '/actualizarhablantes', '/reidentificarminutas',
];

/**
 * True si `text` empieza con "/" pero no es ninguno de los comandos que este
 * modulo reconoce.
 *
 * El caso que cubre: un texto asi NO es una consulta en lenguaje libre, y
 * mandarlo al loop de diagnostico devuelve una respuesta redactada por el
 * modelo con pinta de resultado. Un comando que existe en la CLI de Cerebro
 * y todavia no aqui merece decirlo, no simularlo.
 *
 * Deliberadamente conservador: solo cuenta como comando una barra pegada a
 * una palabra al PRINCIPIO del texto. Una ruta ("/media/san/..."), una
 * fraccion o una fecha no disparan esto, y cualquier texto libre que
 * casualmente empiece con barra pierde, como mucho, una consulta que se
 * puede repetir sin la barra.
 */
function isUnknownSlashCommand(text) {
  const normalized = normalize(text);
  if (!/^\/[a-z][a-z0-9-]*(\s|$)/i.test(normalized)) return false;
  if (COMANDOS_DE_OTROS_MODULOS.includes(normalizeSlashCommandName(normalized))) return false;
  return !KNOWN_COMMAND_PARSERS.some((parser) => parser(normalized) !== null);
}

/**
 * "/foo bar baz" -> "/foo". Para nombrar el comando en el mensaje de error
 * sin devolver el resto del texto del usuario.
 */
function normalizeSlashCommandName(text) {
  const match = normalize(text).match(/^(\/[a-z][a-z0-9-]*)/i);
  return match ? match[1].toLowerCase() : '';
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
  parseAuditCommand,
  parseCrearPrCommand,
  parseCancelarPrCommand,
  parseAprobarPrCommand,
  parseActualizarJiraCommand,
  parseCrearTicketCommand,
  parsePassthroughCommand,
  PASSTHROUGH_COMMANDS,
  FLAGS_PROHIBIDOS_EN_EL_TUNEL,
  parseScriptCommand,
  parseMergeCommand,
  parseConfirmationResponse,
  parseContextoCommand,
  parseModoCommand,
  VALID_SKILLS,
  isUnknownSlashCommand,
  normalizeSlashCommandName,
};
