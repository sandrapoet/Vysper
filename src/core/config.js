const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.appDataDir = path.join(os.homedir(), '.Vysper');
    this.loadConfiguration();
  }

  loadConfiguration() {
    this.config = {
      app: {
        name: 'Vysper',
        version: '1.0.0',
        processTitle: 'Vysper',
        dataDir: this.appDataDir,
        isDevelopment: this.env === 'development',
        isProduction: this.env === 'production'
      },
      
      window: {
        defaultWidth: 400,
        defaultHeight: 600,
        minWidth: 300,
        minHeight: 400,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: path.join(__dirname, '../../preload.js')
        }
      },

      ocr: {
        language: 'eng',
        tempDir: os.tmpdir(),
        cleanupDelay: 5000
      },

      llm: {
        gemini: {
          model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
          maxRetries: Number(process.env.GEMINI_MAX_RETRIES || 3),
          timeout: Number(process.env.GEMINI_TIMEOUT || 120000),
          maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192),
          codingMaxOutputTokens: Number(process.env.GEMINI_CODING_MAX_OUTPUT_TOKENS || 16384),
          finalizationMaxOutputTokens: Number(process.env.GEMINI_FINALIZATION_MAX_OUTPUT_TOKENS || 16384),
          fallbackEnabled: true,
          enableFallbackMethod: true,
          quotaCooldownMs: Number(process.env.GEMINI_QUOTA_COOLDOWN_MS || 10 * 60 * 1000)
        },
        anthropic: {
          model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
          maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 8192),
          behavioralMaxTokens: Number(process.env.ANTHROPIC_BEHAVIORAL_MAX_TOKENS || 900),
          transcriptionMaxTokens: Number(process.env.ANTHROPIC_TRANSCRIPTION_MAX_TOKENS || 1400),
          maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES || 3),
          timeout: Number(process.env.ANTHROPIC_TIMEOUT || 120000),
          quotaCooldownMs: Number(process.env.ANTHROPIC_QUOTA_COOLDOWN_MS || 10 * 60 * 1000)
        }
      },

      speech: {
        whisper: {
          model:       'medium',
          device:      'cpu',
          computeType: 'int8',
          language:    'en',
          vad:         'silero',
        }
      },

      session: {
        maxMemorySize: 1000,
        compressionThreshold: 500,
        clearOnRestart: false
      },

      stealth: {
        hideFromDock: true,
        noAttachConsole: true,
        disguiseProcess: true
      },

      cerebro: {
        path: process.env.CEREBRO_PATH || '/media/san/Miscosas6/Desarrollo/Cerebro',
        python: process.env.CEREBRO_PYTHON || null,
        timeoutMs: Number(process.env.CEREBRO_TIMEOUT_MS || 90000),
        // TODO: quitar este fallback hardcodeado una vez que VYSPER_SILIA_ASSIGNEE
        // este seteado en el .env de cada entorno (pedido explicito para no
        // bloquear "/silia daily" mientras tanto).
        siliaAssignee: process.env.VYSPER_SILIA_ASSIGNEE || 'davidaleman@slia.com',
        // TODO: quitar este fallback hardcodeado una vez que
        // VYSPER_SILIA_DEFAULT_PROJECT este seteado en el .env de cada
        // entorno -- "AGE" (equipo "agentes") es el default historico de
        // "/silia retro" mientras tanto, igual que siliaAssignee arriba.
        siliaDefaultProject: process.env.VYSPER_SILIA_DEFAULT_PROJECT || 'AGE'
      },

      sandraRag: {
        path: process.env.VYSPER_SANDRA_RAG_DIR || '/media/san/Miscosas6/Desarrollo/SandraRagCreAI',
        actualizaTimeoutMs: Number(process.env.VYSPER_SANDRA_RAG_ACTUALIZA_TIMEOUT_MS || 900000)
      }
    };
  }

  get(keyPath) {
    return keyPath.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }

  getApiKey(service) {
    const envKey = `${service.toUpperCase()}_API_KEY`;
    return process.env[envKey];
  }

  isFeatureEnabled(feature) {
    return this.get(`features.${feature}`) !== false;
  }
}

module.exports = new ConfigManager(); 
