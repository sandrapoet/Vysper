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

  runDiagnose(problem, { persona = 'silia' } = {}) {
    const args = ['diagnose', problem];
    if (persona) args.push('--persona', persona);
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
          this.logger.error?.('Cerebro termino con error', { command, code, durationMs, stderr: stderr.slice(0, 2000) });
          reject(new CerebroError(`Cerebro fallo (codigo ${code}). ${stderr.trim().slice(0, 500) || 'Sin detalle adicional.'}`));
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
