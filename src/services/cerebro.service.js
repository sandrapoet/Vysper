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

  runDailyCheckpoint(assignee, { persona = 'silia' } = {}) {
    if (!assignee) {
      return Promise.reject(new CerebroError('No hay un asignado configurado para el checkpoint diario (VYSPER_SILIA_ASSIGNEE).'));
    }
    return this._runCli(['daily-checkpoint', assignee, '--persona', persona]);
  }

  runIncident(description, { persona = 'silia' } = {}) {
    return this._runCli(['incident', description, '--persona', persona]);
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

  _runCli(args) {
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
        this.logger.error?.('Cerebro no respondio a tiempo', { command, timeoutMs: this.timeoutMs });
        reject(new CerebroError(`Cerebro no respondio dentro de ${Math.round(this.timeoutMs / 1000)}s. Intenta de nuevo o revisa que Ollama/MCP esten activos.`));
      }, this.timeoutMs);

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
