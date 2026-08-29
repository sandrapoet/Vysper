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
from pathlib import Path

# pyannote carga su pipeline (segmentacion + embeddings) via torch en cada
# invocacion de este script; sin tope, torch/OpenMP/MKL usan un hilo por core
# disponible. Esto corre mientras el sidecar de Alt+S (ver sidecar.py, mismo
# tope) sigue con la captura en vivo, y la suma de ambos sin limite puede
# saturar toda la CPU y congelar el equipo. Debe fijarse ANTES de importar
# numpy/torch/pyannote.
_CPU_THREAD_CAP = os.environ.get("VYSPER_STT_CPU_THREADS", "2")
for _env_var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ.setdefault(_env_var, _CPU_THREAD_CAP)


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


def _load_audio_for_pyannote(audio_path: Path) -> dict:
    # No delegamos en la carga de audio propia de pyannote (via torchaudio),
    # porque para formatos que no son WAV requiere el backend "torchcodec",
    # que no esta instalado en este venv y hace fallar la diarizacion en
    # silencio para cualquier archivo subido que no sea .wav (mp3, m4a, etc).
    # decode_audio ya viene con faster-whisper (usa PyAV) y decodifica
    # cualquier formato soportado sin depender de torchcodec ni ffmpeg propio.
    from faster_whisper.audio import decode_audio
    import torch

    rate = 16_000
    audio = decode_audio(str(audio_path), sampling_rate=rate)
    waveform = torch.from_numpy(audio).unsqueeze(0)  # (1, time): mono

    return {
        "waveform": waveform,
        "sample_rate": rate,
    }


def diarize(audio_path: Path) -> dict:
    import torch

    torch.set_num_threads(int(_CPU_THREAD_CAP))

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

    audio = _load_audio_for_pyannote(audio_path)
    result = pipeline(audio)
    segments = list(_iter_segments(result))

    _apply_voiceprint_matches(segments, audio["waveform"], audio["sample_rate"], token, device)

    return {
        "audioPath": str(audio_path),
        "model": model,
        "segments": segments,
    }


def _apply_voiceprint_matches(segments: list, waveform, sample_rate: int, token: str, device: str) -> None:
    """Relabels segments in-place with real names when their speaker cluster
    matches a stored voiceprint above the configured threshold. No-op if no
    voiceprints store exists yet, so behavior is unchanged for fresh setups.

    Every segment whose cluster gets evaluated also gets a "score" field (the
    best similarity found, whether or not it cleared the threshold) so a
    later explicit review (main.js's /actualizarHablantes, /reconocerVoz) can
    decide what to mark UNKNOWN without recomputing embeddings. This function
    itself never sets status "UNKNOWN" -- only "MATCHED" on an actual match --
    marking something as reviewed-and-unidentified is a deliberate human/
    explicit-command action, not something every automatic diarization run
    should do.
    """
    import voiceprint_store as vp

    store = vp.load_store()
    if not store:
        return

    grouped = vp.group_segments_by_speaker(segments)
    resolved = {}
    scores = {}
    for speaker_label, speaker_segments in grouped.items():
        try:
            clip = vp.concat_segments_waveform(waveform, sample_rate, speaker_segments)
            embedding = vp.extract_embedding(clip, sample_rate, 0.0, clip.shape[-1] / sample_rate, token, device)
        except Exception as exc:
            print(f"[diarize] Voiceprint match skipped for {speaker_label}: {exc}", file=sys.stderr, flush=True)
            continue

        name, score = vp.match_speaker(embedding, store)
        scores[speaker_label] = round(float(score), 3)
        if name:
            print(f"[diarize] {speaker_label} matched '{name}' (score={score:.3f})", file=sys.stderr, flush=True)
            resolved[speaker_label] = name

    for seg in segments:
        original_label = seg["speaker"]
        if original_label not in scores:
            continue
        seg["score"] = scores[original_label]
        if original_label in resolved:
            seg["speaker"] = resolved[original_label]
            seg["status"] = "MATCHED"


def rematch(speakers_json: Path, audio_override: str) -> dict:
    """Re-runs only the voiceprint matching step (_apply_voiceprint_matches)
    over an existing diarization result, without re-running pyannote's
    clustering pipeline -- the slow part. Used by /actualizarHablantes to
    pick up newly-enrolled voiceprints on an old session cheaply."""
    import torch

    torch.set_num_threads(int(_CPU_THREAD_CAP))

    payload = json.loads(speakers_json.read_text(encoding="utf-8"))
    segments = payload.get("segments") or []
    if not segments:
        raise ValueError("El JSON de diarizacion no tiene segments.")

    audio_path = Path(audio_override).expanduser().resolve() if audio_override else Path(payload["audioPath"])
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    token = _get_token()
    if not token:
        raise RuntimeError(
            "Missing Hugging Face token. Set VYSPER_PYANNOTE_TOKEN, "
            "HUGGINGFACE_ACCESS_TOKEN, or HF_TOKEN."
        )
    device = _resolve_device()

    audio = _load_audio_for_pyannote(audio_path)
    _apply_voiceprint_matches(segments, audio["waveform"], audio["sample_rate"], token, device)

    return {
        "audioPath": str(audio_path),
        "model": payload.get("model"),
        "segments": segments,
    }


def main() -> int:
    _load_repo_env()

    parser = argparse.ArgumentParser(description="Run pyannote speaker diarization.")
    parser.add_argument("audio", nargs="?", help="Audio file to diarize")
    parser.add_argument("--output", "-o", help="Write JSON output to this path")
    parser.add_argument("--rematch", help="Path to an existing speakers-full.json to re-match against the voiceprints store (skips re-clustering)")
    args = parser.parse_args()

    if args.rematch:
        try:
            payload = rematch(Path(args.rematch).expanduser().resolve(), args.audio)
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

    if not args.audio:
        print(json.dumps({"error": "Falta la ruta de audio a diarizar."}), file=sys.stderr)
        return 1

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
