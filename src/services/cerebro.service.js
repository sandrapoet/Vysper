const path = require('path');
const os = require('os');

class CerebroError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'CerebroError';
    this.cause = cause;
  }
}

const DEFAULT_CEREBRO_PATH = '/media/san/Miscosas6/Desarrollo/Cerebro';
const DEFAULT_TIMEOUT_MS = 90000;

function defaultPythonPath(cerebroPath) {
  return os.platform() === 'win32'
    ? path.join(cerebroPath, '.venv', 'Scripts', 'python.exe')
    : path.join(cerebroPath, '.venv', 'bin', 'python');
}

/**
 * Bridge to the Cerebro Python CLI (`python -m cerebro.cli ...`). Kept free
 * of `require('electron')` so it can run under Jest.
 */
class CerebroService {
  constructor({
    cerebroPath = DEFAULT_CEREBRO_PATH,
    pythonPath = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    spawnFn = require('child_process').spawn,
    logger = console
  } = {}) {
    this.cerebroPath = cerebroPath;
    this.pythonPath = pythonPath || defaultPythonPath(cerebroPath);
    this.timeoutMs = timeoutMs;
    this._spawn = spawnFn;
    this.logger = logger;
  }

  /**
   * `tool` (e.g. "jira", "notion", "github") restricts Cerebro's tool loop
   * to only that source's tools (Orchestrator.run's tool_filter) — used by
   * Vysper's /jira, /notion, /github commands so the user picks the scope
   * instead of the LLM guessing which source/breadth to search, which is
   * what produced false "no encontrado" reports when left unscoped.
   */
  runDiagnose(problem, { persona = 'silia', tool = null } = {}) {
    const args = ['diagnose', problem];
    if (persona) args.push('--persona', persona);
    if (tool) args.push('--tool', tool);
    return this._runCli(args);
  }

  /**
   * `localNotesFile` (opcional) apunta a un .txt/.md ya armado por el
   * llamador con minutas/transcripciones locales del ultimo dia habil (la
   * fuente "Claude" de /silia daily) — Cerebro no tiene forma propia de
   * obtener eso, asi que Vysper se lo pasa ya extraido.
   */
  runDailyCheckpoint(assignee, { persona = 'silia', localNotesFile = null } = {}) {
    if (!assignee) {
      return Promise.reject(new CerebroError('No hay un asignado configurado para el checkpoint diario (VYSPER_SILIA_ASSIGNEE).'));
    }
    const args = ['daily-checkpoint', assignee, '--persona', persona];
    if (localNotesFile) args.push('--local-notes-file', localNotesFile);
    return this._runCli(args);
  }

  /**
   * /revisar <url>: pipeline forzado de revision de PR (clone aislado +
   * merge-check + matriz de cumplimiento). Timeout propio, mas generoso
   * que el default: clonar historial completo de un repo real via SSH
   * puede tardar bastante mas que las llamadas normales a Jira/Notion.
   */
  runRevisar(url, { mode = 'basico', diablo = false, force = false, persona = 'silia', timeoutMs = 300000 } = {}) {
    const args = ['revisar', url];
    if (mode && mode !== 'basico') args.push(`--${mode}`);
    if (diablo) args.push('--diablo');
    if (force) args.push('--force');
    args.push('--persona', persona);
    return this._runCli(args, { timeoutMs });
  }

  /**
   * /revisar <url> --merge: mergea/comenta/transiciona Jira -- solo
   * procede si Cerebro ya tiene una revision APPROVED vigente (mismo sha)
   * para esa URL. Nunca re-analiza aqui, asi que el timeout default basta.
   */
  runRevisarMerge(url, { release = false } = {}) {
    const args = ['revisar-merge', url];
    if (release) args.push('--release');
    return this._runCli(args);
  }

  /**
   * /crear-pr <rama>: push de la rama + PR + labels + reviewers +
   * milestone. Timeout largo (push + sintesis LLM + varias llamadas de
   * GitHub/Jira), mismo orden de magnitud que /revisar.
   *
   * `labels` siempre viaja como --labels explicito (nunca se omite): sin
   * eso, el CLI de Cerebro cae en su flujo interactivo de consola (LLM
   * propone, el usuario elige por stdin), que no tiene donde renderizarse
   * en un subprocess de chat -- se colgaria hasta el timeout. Cuando el
   * usuario no pidio labels, se manda "," (coma sola): un string no vacio
   * (asi el CLI no lo trata como "--labels no pasado") que el CLI parsea
   * a una lista vacia. Por la misma razon (input() de consola si hay un
   * sprint activo de Jira sin milestone que lo matchee) siempre se manda
   * --no-milestone -- Vysper nunca crea milestones automaticamente; si
   * hace falta uno, se crea a mano en GitHub.
   *
   * `repoDir` es CRITICO en uso real: este CLI siempre corre con cwd =
   * this.cerebroPath (ver _runCli mas abajo), asi que sin --repo-dir
   * /crear-pr operaria (por error) sobre el propio repo de Cerebro en vez
   * del repo del usuario -- el chequeo de "cambios sin commitear" fallaria
   * ahi, o peor, pushearia/commitaria contra el repo equivocado. Pasa el
   * path absoluto del repo real (ej. /media/.../Silia/Agent) tal como lo
   * escribe el usuario en el comando de chat (--repo-dir <path>).
   * `base` es el nombre de la rama base (ej. 'develop') cuando el repo no
   * integra features contra 'main' -- default: PR_REVIEW_REFERENCE_BRANCH
   * del lado de Cerebro si se omite.
   */
  runCrearPr(branch, { draft = true, labels = [], ticket = null, base = null, repoDir = null, timeoutMs = 300000 } = {}) {
    const args = ['crear-pr', branch, draft ? '--draft' : '--publish'];
    const labelsArg = Array.isArray(labels) && labels.length > 0 ? labels.join(',') : ',';
    args.push('--labels', labelsArg);
    if (ticket) args.push('--ticket', ticket);
    if (base) args.push('--base', base);
    if (repoDir) args.push('--repo-dir', repoDir);
    args.push('--no-milestone');
    return this._runCli(args, { timeoutMs });
  }

  /**
   * /cancelar-pr <url>: cierra un PR de /crear-pr que sigue en draft.
   * Sin interactividad, timeout default.
   */
  runCancelarPr(url) {
    return this._runCli(['cancelar-pr', url]);
  }

  /**
   * /aprobar-pr <url>: aprueba (y opcionalmente corre /revisar --profundo
   * antes). `merge`/`tag` SOLO deben pasarse ya con `confirmar: true`
   * cuando el usuario efectivamente confirmo la accion en un turno previo
   * del chat -- ver runAprobarPrCommand/resolvePendingPrApproval en
   * main.js. Sin `confirmar`, el CLI de Cerebro pediria confirmacion via
   * typer.confirm() (stdin de consola), que en un subprocess sin stdin
   * interactivo real se queda esperando datos que nunca llegan hasta que
   * este timeout lo mata -- por eso Vysper nunca deja que esto pase:
   * siempre corre primero sin --merge/--tag, y solo los agrega ya con
   * --confirmar tras la confirmacion explicita en el chat.
   */
  runAprobarPr(url, { revisar = false, merge = false, tag = false, tagMensaje = null, confirmar = false, timeoutMs = 300000 } = {}) {
    const args = ['aprobar-pr', url];
    if (revisar) args.push('--revisar');
    if (merge) args.push('--merge');
    if (tag) args.push('--tag');
    if (tagMensaje) args.push('--tag-mensaje', tagMensaje);
    if (confirmar) args.push('--confirmar');
    return this._runCli(args, { timeoutMs });
  }

  runIncident(description, { persona = 'silia' } = {}) {
    return this._runCli(['incident', description, '--persona', persona]);
  }

  /**
   * /actualizar-jira <texto>: identifica que cambios de descripcion/fecha/
   * estado/story points pide un texto libre de correcciones (que puede
   * mencionar varios tickets a la vez) y devuelve un PREVIEW -- nunca
   * escribe nada en Jira en esta llamada. `plan`/`confirmar` SOLO deben
   * pasarse cuando el usuario ya confirmo en un turno previo del chat que
   * quiere aplicar ese preview exacto (ver runActualizarJiraCommand/
   * resolvePendingJiraUpdate en main.js) -- `plan` es el array `cambios`
   * devuelto tal cual por la llamada anterior sin --confirmar, nunca se
   * re-genera: Cerebro no vuelve a llamar al LLM en la confirmacion, asi
   * que lo que el usuario vio en el chat es exactamente lo que se escribe.
   */
  runActualizarJira(texto, { plan = null, confirmar = false, timeoutMs = 300000 } = {}) {
    const args = ['actualizar-jira'];
    if (confirmar) {
      args.push('--confirmar', '--plan', JSON.stringify(plan || []));
    } else {
      args.push('--texto', texto);
    }
    return this._runCli(args, { timeoutMs });
  }

  /**
   * /script: ejecuta cerebro/scripts/jira_transition.py -- ruta hardcodeada
   * del lado de Cerebro (_SCRIPT_PATH en cerebro/cli.py), sin argumentos,
   * para que este comando nunca pueda disparar un .py arbitrario. A
   * diferencia de /actualizar-jira, el contenido ya esta fijado en el
   * codigo del script -- no hay preview ni turno de confirmacion en el chat.
   */
  runScript() {
    return this._runCli(['script']);
  }

  /**
   * /merge <numero> --repo <owner/repo>: mergea un PR directo via la API
   * de GitHub -- sin aprobar, sin /revisar, sin Jira (ver runAprobarPr
   * para ese pipeline completo). `confirmar` SOLO debe pasarse en true
   * cuando el usuario ya confirmo en un turno previo del chat (ver
   * runMergeCommand/resolvePendingMerge en main.js) -- sin eso, el CLI de
   * Cerebro rechaza el merge (requiere --confirmar explicito).
   */
  runMergePr(numero, repo, { confirmar = false } = {}) {
    const args = ['merge-pr', String(numero), '--repo', repo];
    if (confirmar) args.push('--confirmar');
    return this._runCli(args);
  }

  /**
   * Consulta con una imagen adjunta (lamina/diagrama/captura): la imagen
   * viaja como un archivo local (el CLI solo acepta argumentos de texto),
   * Cerebro la envia como bloque nativo de la Messages API de Anthropic
   * junto con `problem`. Sin loop de tools ni RAG/MCP (ver
   * Orchestrator.run_visual) -- un unico turno.
   */
  runDiagnoseVisual(imagePath, problem, { persona = 'silia' } = {}) {
    if (!imagePath) {
      return Promise.reject(new CerebroError('Falta la imagen para la consulta visual.'));
    }
    const args = ['diagnose', problem, '--imagen', imagePath, '--persona', persona];
    return this._runCli(args);
  }

  /**
   * Sistema de Mejora Continua (SMC): lista las propuestas de optimizacion
   * generadas por el analisis diario (Fase 3/4). `estado` filtra por
   * propuesta/aceptada/rechazada/pospuesta/implementada/medida.
   */
  runOptimizaciones({ estado = null, dias = null } = {}) {
    const args = ['optimizaciones'];
    if (estado) args.push('--estado', estado);
    if (dias) args.push('--dias', String(dias));
    return this._runCli(args);
  }

  /** Dispara el analisis (Fase 2/3) bajo demanda en vez de esperar al cron diario. */
  runAnalizarOptimizaciones({ dias = null } = {}) {
    const args = ['analizar'];
    if (dias) args.push('--dias', String(dias));
    return this._runCli(args);
  }

  /** Fase 4: registra la decision del equipo sobre una propuesta puntual. */
  runDecidirPropuesta(optimizationId, estado, motivo = '') {
    const args = ['propuesta-decidir', String(optimizationId), estado];
    if (motivo) args.push('--motivo', motivo);
    return this._runCli(args);
  }

  /** Fase 6/7: reporte de efectividad del SMC (propuestas vs aceptadas, impacto medido). */
  runReporteMejora({ periodo = 'semanal' } = {}) {
    return this._runCli(['reporte-mejora', '--periodo', periodo]);
  }

  /**
   * Retrospectiva de sprint (pipeline forzado /silia retro): JQL seguro via
   * la Agile API de Jira (nunca texto libre), metricas calculadas en
   * codigo, Notion/RAG para notas de reunion, e incidentes/optimizaciones
   * del SMC correlacionados por fecha.
   */
  runSprintRetro(projectKey, { sprint = null, persona = 'silia' } = {}) {
    if (!projectKey) {
      return Promise.reject(new CerebroError('Falta el proyecto para la retrospectiva (VYSPER_SILIA_DEFAULT_PROJECT).'));
    }
    const args = ['sprint-retro', projectKey];
    if (sprint) args.push('--sprint', sprint);
    args.push('--persona', persona);
    return this._runCli(args);
  }

  /** Lista las retrospectivas ya generadas para un proyecto. */
  runRetros(projectKey, { limite = null } = {}) {
    const args = ['retros', projectKey];
    if (limite) args.push('--limite', String(limite));
    return this._runCli(args);
  }

  /** Compara dos retrospectivas ya generadas del mismo proyecto (diff aritmetico, sin LLM). */
  runCompararRetro(projectKey, sprintA, sprintB) {
    return this._runCli(['comparar-retro', projectKey, String(sprintA), String(sprintB)]);
  }

  /**
   * Analisis de riesgo de dominio (pipeline forzado /hoy): mapea el
   * dominio a un proyecto Jira via equiv.yaml, trae issues de sprints
   * activos/proximos con detalle completo (Agile API, sin JQL de input
   * libre), y devuelve el markdown ya renderizado listo para mostrar.
   */
  runHoy(dominio, { persona = 'silia' } = {}) {
    if (!dominio) {
      return Promise.reject(new CerebroError('Falta el dominio para el analisis de riesgo (/hoy <dominio>).'));
    }
    return this._runCli(['hoy', dominio, '--persona', persona]);
  }

  /**
   * Vacia a un .md en SandraRagCreAI/documentos el analisis de /hoy ya
   * persistido en SQLite (nunca vuelve a llamar a Jira/LLM). `dominio` es
   * opcional: sin el, usa el ultimo /hoy corrido en cualquier dominio.
   */
  runDetalle(dominio = null) {
    const args = ['detalle'];
    if (dominio) args.push(dominio);
    return this._runCli(args);
  }

  _runCli(args, { timeoutMs = this.timeoutMs } = {}) {
    const startedAt = Date.now();
    const command = `${this.pythonPath} -m cerebro.cli ${args.join(' ')}`;

    return new Promise((resolve, reject) => {
      let child;
      try {
        child = this._spawn(this.pythonPath, ['-m', 'cerebro.cli', ...args], {
          cwd: this.cerebroPath
        });
      } catch (error) {
        this.logger.error?.('No se pudo iniciar el proceso de Cerebro', { command, error: error.message });
        reject(new CerebroError('No se pudo iniciar Cerebro. Revisa que Python y la ruta de Cerebro esten configurados correctamente.', error));
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        this.logger.error?.('Cerebro no respondio a tiempo', { command, timeoutMs });
        reject(new CerebroError(`Cerebro no respondio dentro de ${Math.round(timeoutMs / 1000)}s. Intenta de nuevo o revisa que Ollama/MCP esten activos.`));
      }, timeoutMs);

      child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.logger.error?.('Fallo el proceso de Cerebro', { command, error: error.message });
        reject(new CerebroError('No se pudo comunicar con Cerebro. Verifica que Python este instalado y accesible.', error));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;

        if (code !== 0) {
          // Some CLI commands (e.g. daily-checkpoint's assignee resolution,
          // propuesta-decidir's estado validation) print a structured
          // `{"error": "..."}` to stdout before exiting non-zero. Prefer
          // that human-readable message over the raw stderr traceback.
          let structuredError = null;
          try {
            const parsedStdout = JSON.parse(stdout);
            if (parsedStdout && typeof parsedStdout.error === 'string') {
              structuredError = parsedStdout.error;
            }
          } catch (_) {
            // stdout wasn't structured JSON; fall back to stderr below.
          }

          // Full capture (not just the head) so the actual traceback -
          // which prints after any INFO-level init/audit logging - always
          // ends up in the log file even when the rejected error message
          // below only carries the tail.
          this.logger.error?.('Cerebro termino con error', { command, code, durationMs, stderr });
          // The actual Python exception/traceback is always at the END of
          // stderr, after any INFO-level init logging (e.g. LightRAG's
          // "Creating working directory..." noise on every run) — take the
          // tail, not the head, or the real error never surfaces here.
          const stderrTail = stderr.trim().slice(-800);
          reject(new CerebroError(structuredError || `Cerebro fallo (codigo ${code}). ${stderrTail || 'Sin detalle adicional.'}`));
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(stdout);
        } catch (error) {
          this.logger.error?.('Cerebro devolvio una salida no valida', { command, durationMs, stdoutPreview: stdout.slice(0, 500) });
          reject(new CerebroError('Cerebro devolvio una respuesta que no se pudo interpretar. Intenta de nuevo.', error));
          return;
        }

        this.logger.info?.('Cerebro respondio correctamente', { command, durationMs });
        resolve(parsed);
      });
    });
  }
}

module.exports = { CerebroService, CerebroError };
