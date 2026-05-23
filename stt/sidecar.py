#!/usr/bin/env python3
"""
STT Sidecar — Silero VAD + faster-whisper (medium, CPU int8)

Communicates with Electron via newline-delimited JSON on stdin/stdout.
All debug output goes to stderr so it never pollutes the JSON channel.

Commands  (Node → Python, stdin):
  {"cmd": "start"}   — begin microphone capture + VAD + transcription
  {"cmd": "stop"}    — stop recording (sidecar stays alive, models remain loaded)
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
import numpy as np

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
    )
    (_, _, _, VADIterator, _) = _vad_utils
    log("Silero VAD ready.")
except Exception as exc:
    emit({"type": "error", "message": f"Silero VAD load failed: {exc}"})
    sys.exit(1)

# ── load faster-whisper ────────────────────────────────────────────────────

log("Loading faster-whisper medium (int8, CPU)...")
try:
    from faster_whisper import WhisperModel
    _whisper = WhisperModel("medium", device="cpu", compute_type="int8")
    log("faster-whisper medium ready.")
except Exception as exc:
    emit({"type": "error", "message": f"Whisper load failed: {exc}"})
    sys.exit(1)

# ── audio / VAD constants ──────────────────────────────────────────────────

RATE         = 16_000   # Hz — required by Silero VAD
CHUNK        = 512      # samples = 32 ms @ 16 kHz (Silero requirement)
SPEECH_THR   = 0.4      # VAD probability threshold (lowered for loaded systems)
MIN_SILENCE  = int(os.getenv("VYSPER_STT_MIN_SILENCE_MS", "2500"))
PAD_MS       = 100      # ms of audio padding around speech edges
INTERIM_SEC  = 2.0      # seconds between interim Whisper inferences

# ── shared state ───────────────────────────────────────────────────────────

_audio_q: queue.Queue = queue.Queue()
_is_recording  = threading.Event()
_quit_event    = threading.Event()
_flush_event   = threading.Event()

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
    if _is_recording.is_set():
        _audio_q.put(indata[:, 0].copy())  # float32 mono, range [-1, 1]

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

# ── transcription ──────────────────────────────────────────────────────────

def _transcribe(audio_np: np.ndarray, fast: bool = False) -> str:
    segments, _ = _whisper.transcribe(
        audio_np,
        language="en",
        beam_size=1 if fast else 5,
        best_of=1 if fast else 5,
        vad_filter=False,    # we do our own VAD
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
        if hasattr(vad_iter, "reset_states"):
            vad_iter.reset_states()

    while not _quit_event.is_set():
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
                speech_buf.clear()
                last_interim = time.time()
                log("Speech start detected.")

            elif "end" in event:
                flush_current_speech("vad-end")

        if speaking:
            speech_buf.append(chunk)

            now = time.time()
            accumulated_s = len(speech_buf) * CHUNK / RATE
            if now - last_interim >= INTERIM_SEC and accumulated_s >= 1.0:
                last_interim = now
                audio = np.concatenate(speech_buf)
                try:
                    text = _transcribe(audio, fast=True)
                    if text:
                        log(f"Interim: {text!r}")
                        emit({"type": "interim", "text": text})
                except Exception:
                    pass  # interim errors are non-critical

    log("VAD loop exited.")

# ── command loop (stdin) ───────────────────────────────────────────────────

def _main() -> None:
    vad_thread = threading.Thread(target=_vad_loop, daemon=True, name="vad-loop")
    vad_thread.start()

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
                    emit({"type": "recording_started"})
                    log("Recording started.")
                except Exception as exc:
                    emit({"type": "error", "message": f"Microphone error: {exc}"})

        elif cmd == "stop":
            if _is_recording.is_set():
                _flush_event.set()
                _is_recording.clear()
                _stop_capture()
                emit({"type": "recording_stopped"})
                log("Recording stopped.")

        elif cmd == "quit":
            _is_recording.clear()
            _stop_capture()
            _quit_event.set()
            log("Quit command received.")
            break

    log("Sidecar exiting.")

# ── entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    signal.signal(signal.SIGINT,  lambda *_: _quit_event.set())
    signal.signal(signal.SIGTERM, lambda *_: _quit_event.set())
    _main()
