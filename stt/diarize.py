#!/usr/bin/env python3
"""
Speaker diarization helper for long Secretaria recordings.

Usage:
  python stt/diarize.py /path/to/audio.wav --output /path/to/segments.json

The helper is intentionally independent from sidecar.py so the future Alt+S
meeting pipeline can process finished fragments without disturbing live capture.
"""

import argparse
import json
import os
import sys
import warnings
import wave
from pathlib import Path

import numpy as np


DEFAULT_MODEL = "pyannote/speaker-diarization-community-1"


def _load_repo_env() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _get_token() -> str:
    return (
        os.getenv("VYSPER_PYANNOTE_TOKEN")
        or os.getenv("HUGGINGFACE_ACCESS_TOKEN")
        or os.getenv("HF_TOKEN")
        or ""
    )


def _resolve_device() -> str:
    configured = os.getenv("VYSPER_PYANNOTE_DEVICE", "auto").strip().lower()
    if configured and configured != "auto":
        return configured

    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _iter_segments(diarization):
    if hasattr(diarization, "speaker_diarization"):
        diarization = diarization.speaker_diarization

    if hasattr(diarization, "itertracks"):
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            yield {
                "start": round(float(turn.start), 3),
                "end": round(float(turn.end), 3),
                "speaker": str(speaker),
            }
        return

    try:
        for item in diarization:
            if len(item) != 2:
                continue
            turn, speaker = item
            yield {
                "start": round(float(turn.start), 3),
                "end": round(float(turn.end), 3),
                "speaker": str(speaker),
            }
        return
    except TypeError as exc:
        raise RuntimeError("Unsupported pyannote diarization result format.") from exc


def _load_wav_for_pyannote(audio_path: Path) -> dict:
    with wave.open(str(audio_path), "rb") as reader:
        channels = reader.getnchannels()
        sample_rate = reader.getframerate()
        sample_width = reader.getsampwidth()
        frames = reader.readframes(reader.getnframes())

    if sample_width == 1:
        audio = np.frombuffer(frames, dtype=np.uint8).astype(np.float32)
        audio = (audio - 128.0) / 128.0
    elif sample_width == 2:
        audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    elif sample_width == 4:
        audio = np.frombuffer(frames, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise RuntimeError(f"Unsupported WAV sample width: {sample_width} bytes")

    if channels > 1:
        audio = audio.reshape(-1, channels).T
    else:
        audio = audio.reshape(1, -1)

    import torch

    return {
        "waveform": torch.from_numpy(audio),
        "sample_rate": sample_rate,
    }


def _load_audio_for_pyannote(audio_path: Path):
    if audio_path.suffix.lower() == ".wav":
        return _load_wav_for_pyannote(audio_path)
    return str(audio_path)


def diarize(audio_path: Path) -> dict:
    token = _get_token()
    if not token:
        raise RuntimeError(
            "Missing Hugging Face token. Set VYSPER_PYANNOTE_TOKEN, "
            "HUGGINGFACE_ACCESS_TOKEN, or HF_TOKEN."
        )

    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    warnings.filterwarnings(
        "ignore",
        message=r".*torchcodec is not installed correctly.*",
        category=UserWarning,
    )
    warnings.filterwarnings(
        "ignore",
        category=UserWarning,
        module=r"pyannote\.audio\.core\.io",
    )
    warnings.filterwarnings(
        "ignore",
        message=r".*degrees of freedom is <= 0.*",
        category=UserWarning,
    )

    from pyannote.audio import Pipeline

    model = os.getenv("VYSPER_PYANNOTE_MODEL", DEFAULT_MODEL)
    pipeline = Pipeline.from_pretrained(model, token=token)

    device = _resolve_device()
    if device:
        try:
            import torch

            pipeline.to(torch.device(device))
        except Exception as exc:
            print(
                f"[diarize] Could not move pipeline to {device}: {exc}. Continuing.",
                file=sys.stderr,
                flush=True,
            )

    result = pipeline(_load_audio_for_pyannote(audio_path))
    segments = list(_iter_segments(result))

    return {
        "audioPath": str(audio_path),
        "model": model,
        "segments": segments,
    }


def main() -> int:
    _load_repo_env()

    parser = argparse.ArgumentParser(description="Run pyannote speaker diarization.")
    parser.add_argument("audio", help="Audio file to diarize")
    parser.add_argument("--output", "-o", help="Write JSON output to this path")
    args = parser.parse_args()

    try:
        payload = diarize(Path(args.audio).expanduser().resolve())
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
