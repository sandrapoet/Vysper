#!/usr/bin/env python3
"""
STT Sidecar — Silero VAD + faster-whisper (CPU int8 by default)

Communicates with Electron via newline-delimited JSON on stdin/stdout.
All debug output goes to stderr so it never pollutes the JSON channel.

Commands  (Node → Python, stdin):
  {"cmd": "start"}   — begin microphone capture + VAD + transcription
  {"cmd": "stop"}    — stop recording (sidecar stays alive, models remain loaded)
  {"cmd": "transcribe_file", "path": "...", "request_id": "..."} — transcribe audio file
  {"cmd": "start_meeting", "dir": "...", "segment_sec": 300, "overlap_sec": 3}
  {"cmd": "stop_meeting"} — stop long meeting capture and flush final segment
  {"cmd": "quit"}    — graceful shutdown

Events  (Python → Node, stdout):
  {"type": "ready"}
  {"type": "recording_started"}
  {"type": "recording_stopped"}
  {"type": "interim",        "text": "..."}   — partial, every ~2 s while speaking
  {"type": "transcription",  "text": "..."}   — final, after silence detected
  {"type": "error",          "message": "..."}
"""

import sys
import json
import signal
import threading
import queue
import time
import os
import wave
import numpy as np
from collections import deque

# ── helpers ────────────────────────────────────────────────────────────────

def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

def log(*args) -> None:
    print("[sidecar]", *args, file=sys.stderr, flush=True)

# ── load Silero VAD ────────────────────────────────────────────────────────

log("Loading Silero VAD via torch.hub...")
try:
    import torch
    _vad_model, _vad_utils = torch.hub.load(
        repo_or_dir="snakers4/silero-vad",
        model="silero_vad",
        force_reload=False,
        verbose=False,
        trust_repo=True,
    )
    (_, _, _, VADIterator, _) = _vad_utils
    log("Silero VAD ready.")
except Exception as exc:
    emit({"type": "error", "message": f"Silero VAD load failed: {exc}"})
    sys.exit(1)

# ── load faster-whisper ────────────────────────────────────────────────────

WHISPER_MODEL = os.getenv("VYSPER_STT_MODEL", "small")
WHISPER_DEVICE = os.getenv("VYSPER_STT_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("VYSPER_STT_COMPUTE", "int8")
WHISPER_CPU_THREADS = int(os.getenv("VYSPER_STT_CPU_THREADS", "2"))

log(f"Loading faster-whisper {WHISPER_MODEL} ({WHISPER_COMPUTE}, {WHISPER_DEVICE})...")
try:
    from faster_whisper import WhisperModel
    whisper_kwargs = {
        "device": WHISPER_DEVICE,
        "compute_type": WHISPER_COMPUTE,
    }
    if WHISPER_CPU_THREADS > 0:
        whisper_kwargs["cpu_threads"] = WHISPER_CPU_THREADS
    _whisper = WhisperModel(WHISPER_MODEL, **whisper_kwargs)
    log(f"faster-whisper {WHISPER_MODEL} ready.")
except Exception as exc:
    emit({"type": "error", "message": f"Whisper load failed: {exc}"})
    sys.exit(1)

# ── audio / VAD constants ──────────────────────────────────────────────────

RATE         = 16_000   # Hz — required by Silero VAD
CHUNK        = 512      # samples = 32 ms @ 16 kHz (Silero requirement)
SPEECH_THR   = 0.4      # VAD probability threshold (lowered for loaded systems)
MIN_SILENCE  = int(os.getenv("VYSPER_STT_MIN_SILENCE_MS", "2500"))
PAD_MS       = 100      # ms of audio padding around speech edges
PREROLL_MS   = int(os.getenv("VYSPER_STT_PREROLL_MS", "900"))
                         # ms of audio kept before VAD confirms speech start, to avoid
                         # clipping the first syllable (VAD needs a few frames above
                         # threshold before it fires the "start" event)
PREROLL_CHUNKS = max(1, (PREROLL_MS * RATE + (1000 * CHUNK) - 1) // (1000 * CHUNK))
WARM_PREROLL_MS = int(os.getenv("VYSPER_STT_WARM_PREROLL_MS", "1500"))
WARM_PREROLL_CHUNKS = max(1, (WARM_PREROLL_MS * RATE + (1000 * CHUNK) - 1) // (1000 * CHUNK))
INTERIM_SEC  = float(os.getenv("VYSPER_STT_INTERIM_SEC", "0"))
LANGUAGE     = os.getenv("VYSPER_STT_LANGUAGE") or None
BEAM_SIZE    = int(os.getenv("VYSPER_STT_BEAM_SIZE", "1"))
BEST_OF      = int(os.getenv("VYSPER_STT_BEST_OF", "1"))

# ── shared state ───────────────────────────────────────────────────────────

_audio_q: queue.Queue = queue.Queue()
_raw_audio_q: queue.Queue = queue.Queue()
_meeting_audio_q: queue.Queue = queue.Queue()
_is_recording  = threading.Event()
_is_raw_recording = threading.Event()
_is_meeting_recording = threading.Event()
_quit_event    = threading.Event()
_flush_event   = threading.Event()
_raw_done_event = threading.Event()
_meeting_done_event = threading.Event()
_keep_capture_warm = threading.Event()
_warm_preroll: deque = deque(maxlen=WARM_PREROLL_CHUNKS)
_warm_preroll_lock = threading.Lock()
_raw_path = None
_meeting_dir = None
_meeting_segment_sec = 300.0
_meeting_overlap_sec = 3.0
_meeting_segment_index = 0

# ── audio capture ──────────────────────────────────────────────────────────

try:
    import sounddevice as sd
except Exception as exc:
    emit({
        "type": "error",
        "message": (
            "Audio input load failed: "
            f"{exc}. On Ubuntu/Linux install PortAudio with: "
            "sudo apt install libportaudio2 portaudio19-dev"
        ),
    })
    sys.exit(1)

emit({"type": "ready"})

_capture_stream = None
_capture_lock   = threading.Lock()

def _audio_callback(indata, frames, t, status):
    if status:
        log("sounddevice status:", status)
    chunk = indata[:, 0].copy()  # float32 mono, range [-1, 1]
    if _is_recording.is_set():
        _audio_q.put(chunk)
    elif _keep_capture_warm.is_set():
        with _warm_preroll_lock:
            _warm_preroll.append(chunk)
    if _is_raw_recording.is_set():
        _raw_audio_q.put(chunk.copy())
    if _is_meeting_recording.is_set():
        _meeting_audio_q.put(chunk.copy())

def _start_capture() -> None:
    global _capture_stream
    with _capture_lock:
        if _capture_stream is not None:
            return
        _capture_stream = sd.InputStream(
            samplerate=RATE,
            channels=1,
            dtype="float32",
            blocksize=CHUNK,
            latency="high",
            callback=_audio_callback,
        )
        _capture_stream.start()
        log("Microphone capture started.")

def _stop_capture() -> None:
    global _capture_stream
    with _capture_lock:
        if _capture_stream is None:
            return
        _capture_stream.stop()
        _capture_stream.close()
        _capture_stream = None
        log("Microphone capture stopped.")

def _release_capture_if_idle() -> None:
    if _keep_capture_warm.is_set():
        return
    if _is_recording.is_set() or _is_raw_recording.is_set() or _is_meeting_recording.is_set():
        return
    _stop_capture()

def _float32_to_pcm16(audio: np.ndarray) -> bytes:
    clipped = np.clip(audio, -1.0, 1.0)
    return (clipped * 32767.0).astype(np.int16).tobytes()

def _start_raw_recording(path: str) -> None:
    global _raw_path
    if _is_raw_recording.is_set():
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    while True:
        try:
            _raw_audio_q.get_nowait()
        except queue.Empty:
            break
    _raw_path = path
    _raw_done_event.clear()
    _start_capture()
    _is_raw_recording.set()

def _stop_raw_recording() -> str:
    if not _is_raw_recording.is_set():
        return _raw_path or ""
    _is_raw_recording.clear()
    _release_capture_if_idle()
    _raw_done_event.wait(timeout=5)
    return _raw_path or ""

def _drain_queue(q: queue.Queue) -> None:
    while True:
        try:
            q.get_nowait()
        except queue.Empty:
            return

def _prefill_recording_from_warm_preroll() -> int:
    with _warm_preroll_lock:
        chunks = list(_warm_preroll)
        _warm_preroll.clear()
    for chunk in chunks:
        _audio_q.put(chunk.copy())
    return len(chunks)

def _start_meeting_recording(session_dir: str, segment_sec: float, overlap_sec: float) -> None:
    global _meeting_dir, _meeting_segment_sec, _meeting_overlap_sec, _meeting_segment_index
    if _is_meeting_recording.is_set():
        return
    if not session_dir:
        raise ValueError("Meeting session dir is required.")
    _meeting_dir = session_dir
    _meeting_segment_sec = max(5.0, float(segment_sec or 300.0))
    _meeting_overlap_sec = max(0.0, min(float(overlap_sec or 0.0), _meeting_segment_sec / 2.0))
    _meeting_segment_index = 0
    os.makedirs(os.path.join(_meeting_dir, "audio"), exist_ok=True)
    _drain_queue(_meeting_audio_q)
    _meeting_done_event.clear()
    _start_capture()
    _is_meeting_recording.set()

def _stop_meeting_recording() -> None:
    if not _is_meeting_recording.is_set():
        _meeting_done_event.set()
        return
    _is_meeting_recording.clear()
    _release_capture_if_idle()
    _meeting_done_event.wait(timeout=10)

# ── transcription ──────────────────────────────────────────────────────────

def _transcribe(audio_np: np.ndarray, fast: bool = False) -> str:
    segments, _ = _whisper.transcribe(
        audio_np,
        language=LANGUAGE,
        beam_size=1 if fast else BEAM_SIZE,
        best_of=1 if fast else BEST_OF,
        vad_filter=False,    # we do our own VAD
        condition_on_previous_text=True,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()

def _transcribe_file(path: str) -> str:
    segments, _ = _whisper.transcribe(
        path,
        language=LANGUAGE,
        beam_size=BEAM_SIZE,
        best_of=BEST_OF,
        vad_filter=True,
        condition_on_previous_text=True,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()

# ── VAD processing loop ────────────────────────────────────────────────────

def _vad_loop() -> None:
    vad_iter = VADIterator(
        _vad_model,
        sampling_rate=RATE,
        threshold=SPEECH_THR,
        min_silence_duration_ms=MIN_SILENCE,
        speech_pad_ms=PAD_MS,
    )

    speech_buf: list[np.ndarray] = []
    speaking       = False
    last_interim   = 0.0
    was_recording  = False
    # Rolling buffer of the most recent chunks NOT yet classified as speech.
    # Silero VAD needs a few frames above threshold before it fires "start",
    # so without this the first syllable is always lost.
    preroll: deque = deque(maxlen=PREROLL_CHUNKS)

    def flush_current_speech(reason: str) -> None:
        nonlocal speaking, speech_buf
        if speaking and speech_buf:
            audio = np.concatenate(speech_buf)
            log(f"Speech flush ({reason}) — transcribing {len(audio)/RATE:.1f}s of audio...")
            try:
                text = _transcribe(audio, fast=False)
                if text:
                    log(f"Final: {text!r}")
                    emit({"type": "transcription", "text": text})
            except Exception as exc:
                emit({"type": "error", "message": f"Transcription error: {exc}"})
        speaking = False
        speech_buf.clear()
        preroll.clear()
        if hasattr(vad_iter, "reset_states"):
            vad_iter.reset_states()

    while not _quit_event.is_set():
        now_recording = _is_recording.is_set()
        if now_recording and not was_recording:
            # Fresh recording session: drop any stale audio left over from before.
            preroll.clear()
            speaking = False
            speech_buf.clear()
            if hasattr(vad_iter, "reset_states"):
                vad_iter.reset_states()
        was_recording = now_recording

        if _flush_event.is_set():
            _flush_event.clear()
            # Drenar chunks pendientes para no perder el final del audio
            while True:
                try:
                    remaining = _audio_q.get_nowait()
                    if speaking:
                        speech_buf.append(remaining)
                except queue.Empty:
                    break
            flush_current_speech("stop")
            continue

        try:
            chunk: np.ndarray = _audio_q.get(timeout=0.1)
        except queue.Empty:
            continue

        if not _is_recording.is_set():
            continue

        # Silero VAD expects a 1-D float32 torch tensor
        event = vad_iter(torch.from_numpy(chunk), return_seconds=False)

        if event is not None:
            if "start" in event:
                speaking = True
                # Seed with the pre-roll so the syllable(s) spoken while the VAD
                # was still ramping up aren't clipped from the transcription.
                speech_buf = list(preroll)
                preroll.clear()
                last_interim = time.time()
                log("Speech start detected.")

            elif "end" in event:
                flush_current_speech("vad-end")

        if speaking:
            speech_buf.append(chunk)

            now = time.time()
            accumulated_s = len(speech_buf) * CHUNK / RATE
            if INTERIM_SEC > 0 and now - last_interim >= INTERIM_SEC and accumulated_s >= 1.0:
                last_interim = now
                audio = np.concatenate(speech_buf)
                try:
                    text = _transcribe(audio, fast=True)
                    if text:
                        log(f"Interim: {text!r}")
                        emit({"type": "interim", "text": text})
                except Exception:
                    pass  # interim errors are non-critical
        else:
            preroll.append(chunk)

    log("VAD loop exited.")

def _raw_writer_loop() -> None:
    writer = None
    active_path = None

    def close_writer() -> None:
        nonlocal writer, active_path
        if writer is not None:
            writer.close()
            writer = None
            log(f"Raw recording saved: {active_path}")
        active_path = None
        _raw_done_event.set()

    while not _quit_event.is_set():
        if _is_raw_recording.is_set() and writer is None and _raw_path:
            active_path = _raw_path
            writer = wave.open(active_path, "wb")
            writer.setnchannels(1)
            writer.setsampwidth(2)
            writer.setframerate(RATE)
            log(f"Raw recording writer started: {active_path}")

        try:
            chunk = _raw_audio_q.get(timeout=0.1)
        except queue.Empty:
            if writer is not None and not _is_raw_recording.is_set():
                close_writer()
            elif writer is None and not _is_raw_recording.is_set() and _raw_path:
                _raw_done_event.set()
            continue

        if writer is not None:
            writer.writeframes(_float32_to_pcm16(chunk))

    if writer is not None:
        close_writer()
    log("Raw writer loop exited.")

def _open_meeting_writer(path: str):
    writer = wave.open(path, "wb")
    writer.setnchannels(1)
    writer.setsampwidth(2)
    writer.setframerate(RATE)
    return writer

def _meeting_segment_path(index: int) -> str:
    assert _meeting_dir is not None
    return os.path.join(_meeting_dir, "audio", f"{index:04d}.wav")

def _meeting_writer_loop() -> None:
    global _meeting_segment_index
    writer = None
    active_path = None
    active_index = 0
    frames_in_segment = 0
    overlap_chunks: deque = deque()
    overlap_max_chunks = 0

    def close_segment(final: bool = False) -> None:
        nonlocal writer, active_path, active_index, frames_in_segment
        if writer is None:
            return
        writer.close()
        duration = frames_in_segment / RATE
        path = active_path
        index = active_index
        log(f"Meeting segment saved: {path}")
        emit({
            "type": "meeting_segment",
            "path": path,
            "index": index,
            "duration": duration,
            "final": bool(final),
        })
        writer = None
        active_path = None
        frames_in_segment = 0

    def open_next_segment(prefill: list[np.ndarray] | None = None) -> None:
        nonlocal writer, active_path, active_index, frames_in_segment
        global _meeting_segment_index
        _meeting_segment_index += 1
        active_index = _meeting_segment_index
        active_path = _meeting_segment_path(active_index)
        writer = _open_meeting_writer(active_path)
        frames_in_segment = 0
        for overlap_chunk in prefill or []:
            writer.writeframes(_float32_to_pcm16(overlap_chunk))
            frames_in_segment += len(overlap_chunk)
        log(f"Meeting segment writer started: {active_path}")

    while not _quit_event.is_set():
        if _is_meeting_recording.is_set() and writer is None and _meeting_dir:
            overlap_max_chunks = max(0, int((_meeting_overlap_sec * RATE) / CHUNK))
            overlap_chunks = deque(maxlen=overlap_max_chunks)
            open_next_segment()
            emit({
                "type": "meeting_started",
                "dir": _meeting_dir,
                "segment_sec": _meeting_segment_sec,
                "overlap_sec": _meeting_overlap_sec,
            })

        try:
            chunk = _meeting_audio_q.get(timeout=0.1)
        except queue.Empty:
            if writer is not None and not _is_meeting_recording.is_set():
                close_segment(final=True)
                _meeting_done_event.set()
                emit({"type": "meeting_stopped", "dir": _meeting_dir})
            elif writer is None and not _is_meeting_recording.is_set():
                _meeting_done_event.set()
            continue

        if writer is None:
            continue

        writer.writeframes(_float32_to_pcm16(chunk))
        frames_in_segment += len(chunk)
        if overlap_max_chunks > 0:
            overlap_chunks.append(chunk.copy())

        if frames_in_segment / RATE >= _meeting_segment_sec:
            prefill = list(overlap_chunks)
            close_segment(final=False)
            if _is_meeting_recording.is_set():
                open_next_segment(prefill)

    if writer is not None:
        close_segment(final=True)
    log("Meeting writer loop exited.")

# ── command loop (stdin) ───────────────────────────────────────────────────

def _main() -> None:
    vad_thread = threading.Thread(target=_vad_loop, daemon=True, name="vad-loop")
    vad_thread.start()
    raw_thread = threading.Thread(target=_raw_writer_loop, daemon=True, name="raw-writer-loop")
    raw_thread.start()
    meeting_thread = threading.Thread(target=_meeting_writer_loop, daemon=True, name="meeting-writer-loop")
    meeting_thread.start()

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue

        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            log("Ignored non-JSON input:", raw)
            continue

        cmd = msg.get("cmd")

        if cmd == "start":
            if not _is_recording.is_set():
                try:
                    _start_capture()
                    _is_recording.set()
                    warm_chunks = _prefill_recording_from_warm_preroll() if _keep_capture_warm.is_set() else 0
                    emit({"type": "recording_started"})
                    log(f"Recording started. Warm preroll chunks: {warm_chunks}.")
                except Exception as exc:
                    emit({"type": "error", "message": f"Microphone error: {exc}"})

        elif cmd == "stop":
            if _is_recording.is_set():
                _flush_event.set()
                _is_recording.clear()
                _release_capture_if_idle()
                emit({"type": "recording_stopped"})
                log("Recording stopped.")

        elif cmd == "set_capture_warm":
            enabled = bool(msg.get("enabled"))
            if enabled:
                try:
                    _keep_capture_warm.set()
                    _start_capture()
                    emit({"type": "capture_warmed"})
                    log("Capture warm mode enabled.")
                except Exception as exc:
                    emit({"type": "error", "message": f"Microphone warm-up error: {exc}"})
            else:
                _keep_capture_warm.clear()
                _release_capture_if_idle()
                emit({"type": "capture_released"})
                log("Capture warm mode disabled.")

        elif cmd == "start_raw":
            raw_path = msg.get("path")
            if not raw_path:
                emit({"type": "error", "message": "Raw recording path is required."})
                continue
            try:
                _start_raw_recording(raw_path)
                emit({"type": "recording_started", "mode": "raw", "path": raw_path})
                log("Raw recording started.")
            except Exception as exc:
                emit({"type": "error", "message": f"Raw microphone error: {exc}"})

        elif cmd == "stop_raw":
            try:
                raw_path = _stop_raw_recording()
                emit({"type": "recording_stopped", "mode": "raw", "path": raw_path})
                log("Raw recording stopped.")
            except Exception as exc:
                emit({"type": "error", "message": f"Raw recording stop error: {exc}"})

        elif cmd == "start_meeting":
            try:
                session_dir = msg.get("dir")
                segment_sec = float(msg.get("segment_sec", 300))
                overlap_sec = float(msg.get("overlap_sec", 3))
                _start_meeting_recording(session_dir, segment_sec, overlap_sec)
                log("Meeting recording started.")
            except Exception as exc:
                emit({"type": "error", "message": f"Meeting recording start error: {exc}"})

        elif cmd == "stop_meeting":
            try:
                _stop_meeting_recording()
                log("Meeting recording stopped.")
            except Exception as exc:
                emit({"type": "error", "message": f"Meeting recording stop error: {exc}"})

        elif cmd == "quit":
            _is_recording.clear()
            _is_raw_recording.clear()
            _is_meeting_recording.clear()
            _keep_capture_warm.clear()
            _stop_capture()
            _quit_event.set()
            log("Quit command received.")
            break

        elif cmd == "transcribe_file":
            request_id = msg.get("request_id")
            audio_path = msg.get("path")
            if not audio_path or not os.path.exists(audio_path):
                emit({
                    "type": "error",
                    "source": "file",
                    "request_id": request_id,
                    "message": f"Audio file not found: {audio_path}",
                })
                continue

            try:
                log(f"Transcribing audio file: {audio_path}")
                text = _transcribe_file(audio_path)
                emit({
                    "type": "transcription",
                    "source": "file",
                    "request_id": request_id,
                    "text": text,
                })
            except Exception as exc:
                emit({
                    "type": "error",
                    "source": "file",
                    "request_id": request_id,
                    "message": f"File transcription error: {exc}",
                })

    log("Sidecar exiting.")

# ── entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    signal.signal(signal.SIGINT,  lambda *_: _quit_event.set())
    signal.signal(signal.SIGTERM, lambda *_: _quit_event.set())
    _main()
