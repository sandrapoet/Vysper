/**
 * Servidor HTTP para recibir audio desde el celular (Android) via Tailscale
 * y procesarlo con el mismo pipeline que usan Ctrl+4 (transcribir), Ctrl+5
 * (minuta) y Alt+9 (sintesis de optimizacion) dentro de la app Electron.
 * Tambien expone /comando para mandar comandos de texto del chat (p.ej.
 * /actualizaRag, /hoy, /optimiza <ruta>) desde el celular, y /stream/* para
 * subir una reunion en vivo por segmentos cortos (ver Termux + Tailscale en
 * README.md) reusando el mismo pipeline que Alt+S usa para sesiones largas.
 *
 * Se embebe en el proceso de Electron (main.js) en vez de correr como un
 * proceso Python separado: la logica de transcripcion/diarizacion/minuta ya
 * vive en ApplicationController (main.js) y en speechService, y llamarla
 * directo evita reimplementarla. Ver README.md, seccion "Acceso remoto por
 * Tailscale" para el porque de esta decision.
 *
 * Variables de entorno:
 *   VYSPER_HTTP_SERVER       "1" para habilitar el servidor (lo pone vys.sh --server)
 *   VYSPER_HTTP_PORT         puerto, default 8080
 *   VYSPER_HTTP_USER         usuario para Basic Auth (requerido)
 *   VYSPER_HTTP_PASSWORD     contrasena para Basic Auth (requerido)
 *   VYSPER_HTTP_UPLOAD_DIR   carpeta temporal de audio, default /tmp/vysper_audio
 *   VYSPER_HTTP_LOG          archivo de log, default /media/san/Miscosas6/log/vysper_http.log
 *   VYSPER_HTTP_MAX_MB       limite de tamano de archivo en MB, default 200
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const multer = require('multer');
const winston = require('winston');

const ALLOWED_EXTENSIONS = new Set(['.opus', '.ogg', '.m4a', '.wav']);
const ALLOWED_COMMANDS = new Set(['minuta', 'transcribir', 'optimizar']);

function hashEquals(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createFileLogger(logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level.toUpperCase()} ${message}${metaStr}`;
      })
    ),
    transports: [new winston.transports.File({ filename: logPath })]
  });
}

function basicAuthMiddleware(expectedUser, expectedPassword, log) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      if (sep !== -1) {
        const user = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);
        if (hashEquals(user, expectedUser) && hashEquals(pass, expectedPassword)) {
          return next();
        }
      }
    }
    log.warn('Auth fallida', { path: req.path, ip: req.ip });
    res.set('WWW-Authenticate', 'Basic realm="Vysper"');
    return res.status(401).json({ ok: false, error: 'Credenciales invalidas' });
  };
}

function safeUploadPath(uploadDir, archivo) {
  const base = path.basename(String(archivo || ''));
  const full = path.join(uploadDir, base);
  if (!full.startsWith(path.join(uploadDir, path.sep)) && full !== path.join(uploadDir, base)) {
    return null;
  }
  return full;
}

function convertToWav(inputPath, log) {
  // Nombre de salida siempre distinto al de entrada -- si ya viene un .wav,
  // usar el mismo nombre haria que ffmpeg intente leer y escribir el mismo
  // archivo a la vez (falla o corrompe el original).
  const wavPath = `${inputPath.replace(/\.[^.]+$/, '')}.converted.wav`;
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      wavPath
    ], (error, stdout, stderr) => {
      if (error) {
        log.error('ffmpeg fallo', { inputPath, error: error.message, stderr: String(stderr).slice(-2000) });
        return reject(new Error(`ffmpeg fallo al convertir ${path.basename(inputPath)}: ${error.message}`));
      }
      resolve(wavPath);
    });
  });
}

/**
 * @param {import('../main.js').ApplicationController} controller instancia de
 *   ApplicationController (this dentro de main.js) para reusar
 *   processSecretariaAudioFileAsMeeting / runOptimizaAnalysis / createSecretariaMeetingSessionState.
 * @param {object} speechService singleton de src/services/speech.service.js (transcribeFile).
 */
function startRemoteAudioServer(controller, speechService) {
  if (process.env.VYSPER_HTTP_SERVER !== '1') {
    return null;
  }

  const port = Number(process.env.VYSPER_HTTP_PORT || 8080);
  const uploadDir = process.env.VYSPER_HTTP_UPLOAD_DIR || '/tmp/vysper_audio';
  const logPath = process.env.VYSPER_HTTP_LOG || '/media/san/Miscosas6/log/vysper_http.log';
  const maxMb = Number(process.env.VYSPER_HTTP_MAX_MB || 200);
  const user = process.env.VYSPER_HTTP_USER;
  const password = process.env.VYSPER_HTTP_PASSWORD;

  const log = createFileLogger(logPath);

  if (!user || !password) {
    log.error('VYSPER_HTTP_USER / VYSPER_HTTP_PASSWORD no configurados; el servidor HTTP no arranca.');
    return null;
  }

  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}-${base}${ext}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return cb(new Error(`Extension no permitida: ${ext}. Solo se aceptan .opus, .ogg, .m4a, .wav`));
      }
      cb(null, true);
    }
  });

  const app = express();
  app.use(express.json());
  app.use(basicAuthMiddleware(user, password, log));

  app.post('/upload', (req, res) => {
    upload.single('archivo')(req, res, (error) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        log.warn('Archivo excede el limite de tamano', { maxMb });
        return res.status(413).json({ ok: false, error: `Archivo excede el limite de ${maxMb}MB` });
      }
      if (error) {
        log.warn('Upload rechazado', { error: error.message });
        return res.status(400).json({ ok: false, error: error.message });
      }
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'Falta el archivo (campo "archivo")' });
      }
      log.info('Archivo recibido', { archivo: req.file.filename, size: req.file.size });
      res.json({ ok: true, archivo: req.file.filename, size: req.file.size });
    });
  });

  app.post('/process', async (req, res) => {
    const { comando, archivo } = req.body || {};

    if (!ALLOWED_COMMANDS.has(comando)) {
      return res.status(400).json({ ok: false, error: `comando invalido: ${comando}. Usa minuta|transcribir|optimizar` });
    }

    const inputPath = safeUploadPath(uploadDir, archivo);
    if (!inputPath || !fs.existsSync(inputPath)) {
      return res.status(400).json({ ok: false, error: `archivo no encontrado: ${archivo}` });
    }
    if (!ALLOWED_EXTENSIONS.has(path.extname(inputPath).toLowerCase())) {
      return res.status(400).json({ ok: false, error: 'extension no permitida' });
    }

    log.info('Procesando', { comando, archivo });

    try {
      const wavPath = await convertToWav(inputPath, log);

      if (comando === 'transcribir') {
        const text = await speechService.transcribeFile(wavPath);
        log.info('Transcripcion lista', { archivo });
        return res.json({ ok: true, comando, archivo, resultado: text });
      }

      // minuta y optimizar comparten el mismo primer paso: transcribir +
      // diarizar + generar minuta.md (processSecretariaAudioFileAsMeeting),
      // la sintesis de optimizacion se corre encima del transcript que deja
      // esa sesion en final/.
      const session = controller.createSecretariaMeetingSessionState('uploadedFile');
      await controller.processSecretariaAudioFileAsMeeting(wavPath, session);

      if (comando === 'minuta') {
        if (!session.minutesPath || !fs.existsSync(session.minutesPath)) {
          throw new Error('la minuta no se genero (revisa el log de la app para el error del LLM)');
        }
        const minuta = fs.readFileSync(session.minutesPath, 'utf8');
        log.info('Minuta lista', { archivo, sessionDir: session.sessionDir });
        return res.json({ ok: true, comando, archivo, resultado: minuta, sessionDir: session.sessionDir });
      }

      // comando === 'optimizar'
      const analysis = await controller.runOptimizaAnalysis(session.sessionDir);
      if (!analysis.ok) {
        throw new Error(analysis.error || 'no se pudo generar la estrategia de optimizacion');
      }
      const estrategia = fs.readFileSync(analysis.strategyPath, 'utf8');
      log.info('Estrategia de optimizacion lista', { archivo, sessionDir: session.sessionDir });
      return res.json({ ok: true, comando, archivo, resultado: estrategia, sessionDir: session.sessionDir });
    } catch (error) {
      log.error('Fallo al procesar', { comando, archivo, error: error.message });
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/comando', async (req, res) => {
    const { comando } = req.body || {};
    if (typeof comando !== 'string' || !comando.trim()) {
      return res.status(400).json({ ok: false, error: 'falta "comando" (texto), ej: "/actualizaRag"' });
    }

    const text = comando.trim();
    log.info('Comando de texto recibido', { comando: text });

    try {
      const resultado = await controller.runChatCommandHeadless(text);
      log.info('Comando de texto resuelto', { comando: text });
      return res.json({ ok: true, comando: text, resultado });
    } catch (error) {
      log.error('Comando de texto fallo', { comando: text, error: error.message });
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ── /stream/*: reunion en vivo por segmentos cortos (Termux) ─────────────
  // Cada segmento sube completo por HTTP (no frames en vivo por WebSocket):
  // la resumibilidad viene de reintentar el POST de un segmento puntual si
  // falla. El ensamblado final se hace por numero de secuencia, nunca por
  // orden de llegada -- ver controller.createSecretariaStreamSession y
  // demas metodos en main.js.
  const streamUpload = multer({
    storage: multer.diskStorage({
      // Se guarda primero en uploadDir con nombre temporal: recien sabemos
      // a que streamId/seq corresponde el archivo cuando multer termina de
      // parsear el body completo (no hay garantia de que el campo "seq"
      // llegue antes que el archivo en el multipart), asi que el handler lo
      // renombra al lugar final (chunks_opus/000N.ext) despues.
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `stream-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
      }
    }),
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return cb(new Error(`Extension no permitida: ${ext}. Solo se aceptan .opus, .ogg, .m4a, .wav`));
      }
      cb(null, true);
    }
  });

  app.post('/stream/start', (req, res) => {
    if (controller.optimizacionActive) {
      return res.status(409).json({
        ok: false,
        error: 'hay una entrevista de Optimizacion (Alt+O) activa; no se puede iniciar streaming ahora'
      });
    }
    const segmentSec = Number(req.body?.segmentSec) || undefined;
    const streamState = controller.createSecretariaStreamSession(segmentSec);
    log.info('Stream iniciado', { streamId: streamState.id, sessionDir: streamState.session.sessionDir });
    res.json({ ok: true, streamId: streamState.id, sessionDir: streamState.session.sessionDir });
  });

  app.post('/stream/:id/segmento', (req, res) => {
    streamUpload.single('archivo')(req, res, async (error) => {
      const streamState = controller.getSecretariaStreamSession(req.params.id);
      if (!streamState) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ ok: false, error: 'stream no encontrado (¿ya se cerro con /finish?)' });
      }
      if (error) {
        log.warn('Segmento rechazado', { streamId: streamState.id, error: error.message });
        return res.status(400).json({ ok: false, error: error.message });
      }
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'falta el archivo (campo "archivo")' });
      }

      const seq = Number(req.body?.seq);
      if (!Number.isInteger(seq) || seq < 1) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ ok: false, error: 'falta "seq" (entero >= 1)' });
      }
      const durationSec = req.body?.durationSec ? Number(req.body.durationSec) : null;

      const ext = path.extname(req.file.originalname).toLowerCase();
      const opusPath = path.join(streamState.session.sessionDir, 'audio', 'chunks_opus', `${String(seq).padStart(4, '0')}${ext}`);
      fs.renameSync(req.file.path, opusPath);

      try {
        const convertedPath = await convertToWav(opusPath, log);
        const wavPath = path.join(streamState.session.sessionDir, 'audio', 'chunks_wav', `${String(seq).padStart(4, '0')}.wav`);
        fs.renameSync(convertedPath, wavPath);

        await controller.ingestSecretariaStreamSegment(streamState, seq, wavPath, opusPath, req.file.size, durationSec);
        log.info('Segmento procesado', { streamId: streamState.id, seq });
        res.json({ ok: true, seq, status: 'transcrito' });
      } catch (err) {
        // El cliente (Termux) reintenta el mismo POST con el mismo seq --
        // ingestSecretariaStreamSegment es idempotente sobre reintentos.
        log.warn('Segmento fallo al procesar', { streamId: streamState.id, seq, error: err.message });
        res.status(500).json({ ok: false, seq, error: err.message });
      }
    });
  });

  app.get('/stream/:id/estado', (req, res) => {
    const streamState = controller.getSecretariaStreamSession(req.params.id);
    if (!streamState) {
      return res.status(404).json({ ok: false, error: 'stream no encontrado' });
    }
    const segments = [...streamState.segments.values()].sort((a, b) => a.seq - b.seq);
    res.json({ ok: true, streamId: streamState.id, status: streamState.status, maxSeqSeen: streamState.maxSeqSeen, segments });
  });

  app.post('/stream/:id/finish', async (req, res) => {
    const streamState = controller.getSecretariaStreamSession(req.params.id);
    if (!streamState) {
      return res.status(404).json({ ok: false, error: 'stream no encontrado (¿ya se finalizo antes?)' });
    }
    const graceMs = Number(req.body?.graceMs) || 20000;
    log.info('Finalizando stream', { streamId: streamState.id, graceMs });
    try {
      const result = await controller.finishSecretariaStreamSession(streamState, { graceMs });
      if (!result.minutesPath || !fs.existsSync(result.minutesPath)) {
        throw new Error('la minuta no se genero (revisa el log de la app para el error del LLM)');
      }
      const minuta = fs.readFileSync(result.minutesPath, 'utf8');
      log.info('Stream finalizado', { streamId: streamState.id, sessionDir: result.sessionDir, lostSegments: result.lostSegments });
      res.json({ ok: true, resultado: minuta, sessionDir: result.sessionDir, segmentosPerdidos: result.lostSegments });
    } catch (err) {
      log.error('Fallo al finalizar stream', { streamId: req.params.id, error: err.message });
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  const server = app.listen(port, '0.0.0.0', () => {
    log.info(`Servidor HTTP escuchando en 0.0.0.0:${port}`, { uploadDir, maxMb });
  });

  server.on('error', (error) => {
    log.error('No se pudo iniciar el servidor HTTP', { error: error.message, port });
  });

  return server;
}

module.exports = { startRemoteAudioServer };
