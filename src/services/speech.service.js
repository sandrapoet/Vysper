'use strict';

const { EventEmitter } = require('events');
const { spawn }        = require('child_process');
const path             = require('path');
const fs               = require('fs');
const logger           = require('../core/logger').createServiceLogger('SPEECH');

// ── paths ──────────────────────────────────────────────────────────────────

const SIDECAR_PATH      = path.join(__dirname, '../../stt/sidecar.py');
const VENV_PYTHON_WIN   = path.join(__dirname, '../../stt/venv_windows/Scripts/python.exe');
const VENV_PYTHON_UNIX  = path.join(__dirname, '../../stt/venv/bin/python');
const STT_MODEL         = process.env.VYSPER_STT_MODEL || 'small';
const STT_DEVICE        = process.env.VYSPER_STT_DEVICE || 'cpu';
const STT_COMPUTE       = process.env.VYSPER_STT_COMPUTE || 'int8';
const STT_CPU_THREADS   = process.env.VYSPER_STT_CPU_THREADS || '2';
const STT_INTERIM_SEC   = process.env.VYSPER_STT_INTERIM_SEC || '0';
const STT_PRELOAD       = process.env.VYSPER_STT_PRELOAD === '1';
const STT_IDLE_EXIT_MS  = Number(process.env.VYSPER_STT_IDLE_EXIT_MS || 120000);

function _resolvePython() {
  if (fs.existsSync(VENV_PYTHON_WIN))  return VENV_PYTHON_WIN;
  if (fs.existsSync(VENV_PYTHON_UNIX)) return VENV_PYTHON_UNIX;
  return process.env.PYTHON_PATH || 'python';
}

// ── service ────────────────────────────────────────────────────────────────

class SpeechService extends EventEmitter {
  constructor() {
    super();
    this._proc            = null;   // child_process.ChildProcess
    this._lineBuffer      = '';
    this.isRecording      = false;
    this.isInitialized    = false;
    this.isReady          = false;
    this.sessionStartTime = null;
    this._pendingFileTranscriptions = new Map();
    this._nextFileRequestId = 1;
    this._pendingRawStop = null;
    this._pendingMeetingStop = null;
    this.isMeetingRecording = false;
    this.meetingSessionDir = null;
    this._idleExitTimer = null;
    this._keepAlive = false;
    this._keepAliveReason = '';

    this.initializeClient();
  }

  // ── init ─────────────────────────────────────────────────────────────────

  initializeClient() {
    if (!fs.existsSync(SIDECAR_PATH)) {
      logger.error(`STT sidecar not found at ${SIDECAR_PATH}. Run stt/setup.bat first.`);
      return;
    }
    this.isInitialized = true;
    logger.info(`SpeechService ready (Silero VAD + faster-whisper ${STT_MODEL})`);

    if (STT_PRELOAD) {
      logger.info('STT preload enabled; loading sidecar during app startup.');
      this._spawnSidecar();
    } else {
      logger.info('STT preload disabled; sidecar will start on first voice action.');
    }
  }

  // ── sidecar lifecycle ─────────────────────────────────────────────────────

  _spawnSidecar() {
    if (this._proc) return;
    this._clearIdleExitTimer();

    const python = _resolvePython();
    logger.info(`Spawning STT sidecar: ${python} ${SIDECAR_PATH}`);

    this._proc = spawn(python, [SIDECAR_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VYSPER_STT_MODEL: STT_MODEL,
        VYSPER_STT_DEVICE: STT_DEVICE,
        VYSPER_STT_COMPUTE: STT_COMPUTE,
        VYSPER_STT_CPU_THREADS: STT_CPU_THREADS,
        VYSPER_STT_INTERIM_SEC: STT_INTERIM_SEC,
      },
    });

    // stdout — newline-delimited JSON
    this._proc.stdout.on('data', (data) => {
      this._lineBuffer += data.toString('utf8');
      const lines = this._lineBuffer.split('\n');
      this._lineBuffer = lines.pop();            // keep incomplete last line
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) this._handleMessage(trimmed);
      }
    });

    // stderr — debug/log lines from sidecar
    this._proc.stderr.on('data', (data) => {
      logger.debug(data.toString('utf8').trimEnd());
    });

    this._proc.on('exit', (code, sig) => {
      logger.info(`STT sidecar exited (code=${code} signal=${sig})`);
      this._proc = null;
      this.isReady = false;
      for (const requestId of this._pendingFileTranscriptions.keys()) {
        this._resolveFileTranscription(requestId, new Error('STT sidecar exited during file transcription.'));
      }
      if (this._pendingRawStop) {
        const pending = this._pendingRawStop;
        this._pendingRawStop = null;
        pending.reject(new Error('STT sidecar exited during raw recording.'));
      }
      if (this._pendingMeetingStop) {
        const pending = this._pendingMeetingStop;
        this._pendingMeetingStop = null;
        pending.reject(new Error('STT sidecar exited during meeting recording.'));
      }
      if (this.isRecording) {
        this.isRecording = false;
        this.emit('recording-stopped');
        this.emit('error', { message: 'STT sidecar exited unexpectedly.' });
      }
    });

    this._proc.on('error', (err) => {
      logger.error(`Failed to spawn STT sidecar: ${err.message}`);
      this.emit('error', { message: `Cannot start STT sidecar: ${err.message}` });
      this._proc = null;
      this.isReady = false;
    });
  }

  _clearIdleExitTimer() {
    if (!this._idleExitTimer) return;
    clearTimeout(this._idleExitTimer);
    this._idleExitTimer = null;
  }

  _scheduleIdleExit() {
    if (!this._proc || STT_IDLE_EXIT_MS <= 0) return;
    if (this._keepAlive) return;
    if (this.isRecording || this.isMeetingRecording || this._pendingFileTranscriptions.size > 0 || this._pendingRawStop || this._pendingMeetingStop) return;

    this._clearIdleExitTimer();
    this._idleExitTimer = setTimeout(() => {
      if (!this._proc || this.isRecording || this.isMeetingRecording || this._pendingFileTranscriptions.size > 0 || this._pendingRawStop || this._pendingMeetingStop) {
        return;
      }
      logger.info(`STT sidecar idle for ${STT_IDLE_EXIT_MS}ms; shutting it down to free CPU/RAM.`);
      this._send({ cmd: 'quit' });
    }, STT_IDLE_EXIT_MS);
    this._idleExitTimer.unref?.();
  }

  warmUp(reason = 'manual') {
    if (!this.isInitialized) return false;
    logger.info('STT warm-up requested', { reason });
    this._spawnSidecar();
    return true;
  }

  setCaptureWarm(enabled) {
    if (!this._proc) {
      if (!enabled) return;
      this._spawnSidecar();
    }
    this._send({ cmd: 'set_capture_warm', enabled: Boolean(enabled) });
  }

  setKeepAlive(enabled, reason = '') {
    this._keepAlive = Boolean(enabled);
    this._keepAliveReason = this._keepAlive ? reason : '';

    if (this._keepAlive) {
      this._clearIdleExitTimer();
      logger.info('STT keep-alive enabled', { reason: this._keepAliveReason });
      this.warmUp(this._keepAliveReason || 'keep-alive');
      this.setCaptureWarm(true);
      return;
    }

    logger.info('STT keep-alive disabled', { reason });
    this.setCaptureWarm(false);
    this._scheduleIdleExit();
  }

  // ── message handler ───────────────────────────────────────────────────────

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      logger.warn('Non-JSON from sidecar', { raw });
      return;
    }

    switch (msg.type) {
      case 'ready':
        this.isReady = true;
        logger.info('STT sidecar models loaded and ready.');
        this.emit('status', { status: 'ready', initialized: true });
        break;

      case 'recording_started':
        this._clearIdleExitTimer();
        this.isRecording = true;
        this.sessionStartTime = Date.now();
        this.emit('recording-started');
        break;

      case 'recording_stopped':
        this.isRecording = false;
        if (msg.mode === 'raw' && this._pendingRawStop) {
          const pending = this._pendingRawStop;
          this._pendingRawStop = null;
          pending.resolve(msg.path || '');
        }
        this.emit('recording-stopped');
        this._scheduleIdleExit();
        break;

      case 'meeting_started':
        this._clearIdleExitTimer();
        this.isMeetingRecording = true;
        this.meetingSessionDir = msg.dir || null;
        this.emit('meeting-started', {
          dir: msg.dir || '',
          segmentSec: msg.segment_sec,
          overlapSec: msg.overlap_sec
        });
        break;

      case 'meeting_segment':
        this.emit('meeting-segment', {
          path: msg.path,
          index: msg.index,
          duration: msg.duration,
          final: Boolean(msg.final)
        });
        break;

      case 'meeting_stopped':
        this.isMeetingRecording = false;
        this.meetingSessionDir = null;
        if (this._pendingMeetingStop) {
          const pending = this._pendingMeetingStop;
          this._pendingMeetingStop = null;
          pending.resolve(msg.dir || '');
        }
        this.emit('meeting-stopped', { dir: msg.dir || '' });
        this._scheduleIdleExit();
        break;

      case 'interim':
        this.emit('interim-transcription', msg.text || '');
        break;

      case 'transcription':
        if (msg.source === 'file' && msg.request_id) {
          this._resolveFileTranscription(msg.request_id, null, msg.text || '');
          this._scheduleIdleExit();
        } else {
          this.emit('transcription', msg.text || '');
        }
        break;

      case 'error':
        logger.error(`Sidecar error: ${msg.message}`);
        if (msg.request_id && this._pendingFileTranscriptions.has(msg.request_id)) {
          this._resolveFileTranscription(msg.request_id, new Error(msg.message || 'File transcription failed'));
          this._scheduleIdleExit();
          break;
        }
        this.emit('error', { message: msg.message });
        break;

      default:
        logger.debug('Unknown sidecar message:', msg);
    }
  }

  // ── send command ──────────────────────────────────────────────────────────

  _send(obj) {
    if (!this._proc || !this._proc.stdin.writable) {
      logger.warn('Cannot send to sidecar — process unavailable.');
      return;
    }
    this._proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  _resolveFileTranscription(requestId, error, text = '') {
    const pending = this._pendingFileTranscriptions.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this._pendingFileTranscriptions.delete(requestId);

    if (error) {
      pending.reject(error);
      return;
    }

    pending.resolve(text);
  }

  // ── public API (same interface as before) ─────────────────────────────────

  startRecording() {
    if (!this.isInitialized) {
      this.emit('error', { message: 'Speech service not initialized. Run stt/setup.bat first.' });
      return;
    }
    if (!this._proc) this._spawnSidecar();
    this._send({ cmd: 'start' });
  }

  stopRecording() {
    if (!this._proc) return;
    this._send({ cmd: 'stop' });
  }

  startRawRecording(filePath) {
    if (!this.isInitialized) {
      this.emit('error', { message: 'Speech service not initialized. Run stt/setup.bat first.' });
      return;
    }
    if (!filePath || typeof filePath !== 'string') {
      this.emit('error', { message: 'Invalid raw recording file path.' });
      return;
    }
    if (!this._proc) this._spawnSidecar();
    this._send({ cmd: 'start_raw', path: filePath });
  }

  stopRawRecording() {
    if (!this._proc) return Promise.resolve('');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pendingRawStop = null;
        reject(new Error('Raw recording stop timed out.'));
      }, 10000);
      timeout.unref?.();

      this._pendingRawStop = {
        resolve: (filePath) => {
          clearTimeout(timeout);
          resolve(filePath);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      };

      this._send({ cmd: 'stop_raw' });
    });
  }

  startMeetingRecording(sessionDir, options = {}) {
    if (!this.isInitialized) {
      this.emit('error', { message: 'Speech service not initialized. Run stt/setup.bat first.' });
      return;
    }
    if (!sessionDir || typeof sessionDir !== 'string') {
      this.emit('error', { message: 'Invalid meeting session directory.' });
      return;
    }
    if (!this._proc) this._spawnSidecar();
    this._send({
      cmd: 'start_meeting',
      dir: sessionDir,
      segment_sec: Number(options.segmentSec || 300),
      overlap_sec: Number(options.overlapSec || 3)
    });
  }

  stopMeetingRecording() {
    if (!this._proc) return Promise.resolve('');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pendingMeetingStop = null;
        reject(new Error('Meeting recording stop timed out.'));
      }, 15000);
      timeout.unref?.();

      this._pendingMeetingStop = {
        resolve: (sessionDir) => {
          clearTimeout(timeout);
          resolve(sessionDir);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      };

      this._send({ cmd: 'stop_meeting' });
    });
  }

  transcribeFile(filePath) {
    if (!this.isInitialized) {
      return Promise.reject(new Error('Speech service not initialized. Run stt/setup.bat first.'));
    }
    if (!filePath || typeof filePath !== 'string') {
      return Promise.reject(new Error('Invalid audio file path.'));
    }
    if (!this._proc) this._spawnSidecar();

    const requestId = `file-${this._nextFileRequestId++}`;
    const timeoutMs = 30 * 60 * 1000;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pendingFileTranscriptions.delete(requestId);
        reject(new Error('Audio file transcription timed out.'));
      }, timeoutMs);
      timeout.unref?.();

      this._pendingFileTranscriptions.set(requestId, { resolve, reject, timeout });
      this._send({ cmd: 'transcribe_file', path: filePath, request_id: requestId });
    });
  }

  getStatus() {
    return {
      isRecording:     this.isRecording,
      isMeetingRecording: this.isMeetingRecording,
      meetingSessionDir: this.meetingSessionDir,
      isInitialized:   this.isInitialized,
      isReady:         this.isReady,
      sidecarPid:      this._proc ? this._proc.pid : null,
      sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
      retryCount:      0,
      config: {
        model:   STT_MODEL,
        vad:     'silero',
        backend: 'faster-whisper',
        device:  STT_DEVICE,
        compute: STT_COMPUTE,
        cpuThreads: STT_CPU_THREADS,
        interimSeconds: STT_INTERIM_SEC,
        keepAlive: this._keepAlive,
        keepAliveReason: this._keepAliveReason,
      },
    };
  }

  async testConnection() {
    const python = _resolvePython();
    return new Promise((resolve, reject) => {
      const proc = spawn(python, ['-c', 'from faster_whisper import WhisperModel; print("ok")']);
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && out.trim() === 'ok') resolve(true);
        else reject(new Error(`faster-whisper check failed (exit ${code})`));
      });
      proc.on('error', reject);
    });
  }

  // ── graceful shutdown ──────────────────────────────────────────────────────

  cleanup() {
    if (!this._proc) return;
    logger.info('Shutting down STT sidecar...');
    this._clearIdleExitTimer();
    this._send({ cmd: 'quit' });
    // Force-kill if sidecar doesn't respond within 3 s
    setTimeout(() => {
      if (this._proc) {
        logger.warn('Force-killing STT sidecar.');
        this._proc.kill('SIGKILL');
      }
    }, 3000).unref();
  }
}

module.exports = new SpeechService();
