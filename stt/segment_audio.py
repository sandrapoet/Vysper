#!/usr/bin/env python3
"""
Offline audio segmentation helper for the Secretaria meeting pipeline.

Usage:
  python stt/segment_audio.py /path/to/uploaded-audio.mp3 --output-dir /path/to/session/audio --segment-sec 300 --overlap-sec 3

Splits an existing audio file (any format faster-whisper/PyAV can decode:
wav, mp3, m4a, aac, flac, ogg, opus, webm, mp4, mpeg) into fixed-length WAV
segments with a sliding overlap, using the same segment_sec/overlap_sec
semantics as the live Alt+S meeting capture in sidecar.py's
_meeting_writer_loop: each segment after the first is prefixed with the last
overlap_sec seconds of the previous one, so downstream transcription never
loses words cut at a segment boundary.

Intentionally independent from sidecar.py (like diarize.py) so it can run as
a one-shot batch job without touching live microphone capture state.

Prints a JSON array of {"index", "path", "duration", "final"} to stdout on
success — one entry per written .wav file, in the same shape as sidecar.py's
"meeting_segment" event — so main.js can feed it straight into the same
per-segment processing queue used for live recordings.
"""

import argparse
import json
import sys
import wave
from pathlib import Path

import numpy as np

RATE = 16_000  # Hz — matches sidecar.py's live capture rate


def _float32_to_pcm16(audio: np.ndarray) -> bytes:
    clipped = np.clip(audio, -1.0, 1.0)
    return (clipped * 32767.0).astype(np.int16).tobytes()


def _write_wav(path: Path, audio: np.ndarray) -> None:
    with wave.open(str(path), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(RATE)
        writer.writeframes(_float32_to_pcm16(audio))


def segment_audio(input_path: Path, output_dir: Path, segment_sec: float, overlap_sec: float) -> list:
    from faster_whisper.audio import decode_audio

    audio = decode_audio(str(input_path), sampling_rate=RATE)
    total_samples = len(audio)
    if total_samples == 0:
        raise ValueError("El archivo de audio no tiene contenido decodificable.")

    segment_sec = max(5.0, float(segment_sec or 300.0))
    overlap_sec = max(0.0, min(float(overlap_sec or 0.0), segment_sec / 2.0))
    segment_samples = int(segment_sec * RATE)
    step_samples = max(1, int((segment_sec - overlap_sec) * RATE))

    output_dir.mkdir(parents=True, exist_ok=True)

    segments = []
    index = 1
    start = 0
    while start < total_samples:
        end = min(start + segment_samples, total_samples)
        chunk = audio[start:end]
        final = end >= total_samples

        segment_path = output_dir / f"{index:04d}.wav"
        _write_wav(segment_path, chunk)

        segments.append({
            "index": index,
            "path": str(segment_path),
            "duration": len(chunk) / RATE,
            "final": final,
        })

        if final:
            break
        start += step_samples
        index += 1

    return segments


def main() -> int:
    parser = argparse.ArgumentParser(description="Split an audio file into overlapping WAV segments.")
    parser.add_argument("input", help="Audio file to segment")
    parser.add_argument("--output-dir", "-o", required=True, help="Directory to write NNNN.wav segments into")
    parser.add_argument("--segment-sec", type=float, default=300.0)
    parser.add_argument("--overlap-sec", type=float, default=3.0)
    args = parser.parse_args()

    try:
        segments = segment_audio(
            Path(args.input).expanduser().resolve(),
            Path(args.output_dir).expanduser().resolve(),
            args.segment_sec,
            args.overlap_sec,
        )
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1

    print(json.dumps(segments, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
