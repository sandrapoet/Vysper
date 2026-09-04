#!/usr/bin/env python3
"""
Persistent speaker voiceprints, shared by diarize.py (matching) and
enroll_speaker.py (enrollment).

Kept free of module-level torch/pyannote imports so importing this module
never triggers a heavy load before diarize.py has had a chance to set the
CPU thread caps (see diarize.py's _CPU_THREAD_CAP comment).
"""

import difflib
import json
import os
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

DEFAULT_STORE_PATH = Path.home() / ".Vysper" / "voiceprints.json"
DEFAULT_EMBEDDING_MODEL = "pyannote/embedding"
DEFAULT_THRESHOLD = 0.60
MAX_ENROLL_SECONDS = 20.0


def store_path() -> Path:
    configured = os.getenv("VYSPER_VOICEPRINTS_PATH")
    return Path(configured).expanduser() if configured else DEFAULT_STORE_PATH


def embedding_model_name() -> str:
    return os.getenv("VYSPER_VOICEPRINT_MODEL", DEFAULT_EMBEDDING_MODEL)


def match_threshold() -> float:
    try:
        return float(os.getenv("VYSPER_VOICEPRINT_THRESHOLD", DEFAULT_THRESHOLD))
    except ValueError:
        return DEFAULT_THRESHOLD


def load_store(path: Path = None) -> dict:
    path = path or store_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_store(store: dict, path: Path = None) -> None:
    path = path or store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def upsert_voiceprint(store: dict, name: str, embedding: np.ndarray) -> dict:
    entry = store.setdefault(name, {"embeddings": [], "updated": None})
    entry["embeddings"].append(embedding.tolist())
    entry["updated"] = datetime.now(timezone.utc).isoformat()
    return store


def _normalize_name(name: str) -> str:
    """Case/accent/whitespace-insensitive key, so 'Bryan' and 'Brayan' aren't
    treated as unrelated just because of casing or accents."""
    stripped = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return " ".join(stripped.lower().split())


def find_exact_name(store: dict, name: str) -> str:
    """Returns the existing store key that matches `name` once case/accents/
    whitespace are normalized away, or None. Used so re-enrolling 'sandra' vs
    'Sandra' doesn't fork a second entry for the same person."""
    target = _normalize_name(name)
    for existing in store:
        if _normalize_name(existing) == target:
            return existing
    return None


def find_similar_names(store: dict, name: str, cutoff: float = 0.82, limit: int = 3) -> list:
    """Returns existing store keys that are a close-but-not-exact spelling of
    `name` (e.g. 'Brayam Camilo Mosquera Mateus' vs 'Bryan Camilo Mosquera
    Mateus'), most similar first. A typo here used to silently fork a brand
    new 1-sample voiceprint instead of adding a sample to the person's
    existing entry -- this lets callers catch that before it happens."""
    target = _normalize_name(name)
    candidates = {existing: _normalize_name(existing) for existing in store}
    close = difflib.get_close_matches(target, candidates.values(), n=limit, cutoff=cutoff)
    ordered = []
    for normalized in close:
        for existing, existing_normalized in candidates.items():
            if existing_normalized == normalized and existing not in ordered:
                ordered.append(existing)
    return ordered


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1e-9
    return float(np.dot(a, b) / denom)


def match_speaker(embedding: np.ndarray, store: dict, threshold: float = None):
    """Returns (name, score) for the best match above threshold, or (None, best_score)."""
    threshold = match_threshold() if threshold is None else threshold
    best_name = None
    best_score = -1.0
    for name, entry in store.items():
        for sample in entry.get("embeddings", []):
            score = _cosine_similarity(embedding, np.array(sample, dtype=np.float32))
            if score > best_score:
                best_score = score
                best_name = name
    if best_name is not None and best_score >= threshold:
        return best_name, best_score
    return None, best_score


_inference_cache = {}


def _get_inference(token: str, device: str = None):
    """Lazily loads and caches the pyannote embedding model for this process."""
    cache_key = (embedding_model_name(), device)
    if cache_key in _inference_cache:
        return _inference_cache[cache_key]

    import torch
    from pyannote.audio import Model, Inference

    model = Model.from_pretrained(embedding_model_name(), token=token)
    inference = Inference(model, window="whole")
    if device:
        try:
            inference.to(torch.device(device))
        except Exception:
            pass

    _inference_cache[cache_key] = inference
    return inference


def extract_embedding(waveform, sample_rate: int, start: float, end: float, token: str, device: str = None) -> np.ndarray:
    """waveform: torch tensor shaped (1, time), as produced by diarize.py's
    _load_audio_for_pyannote. start/end in seconds."""
    inference = _get_inference(token, device)

    start_sample = max(0, int(start * sample_rate))
    end_sample = min(waveform.shape[-1], int(end * sample_rate))
    if end_sample <= start_sample:
        raise ValueError(f"Empty audio range: {start:.3f}s-{end:.3f}s")

    clip = waveform[:, start_sample:end_sample]
    embedding = inference({"waveform": clip, "sample_rate": sample_rate})
    return np.asarray(embedding, dtype=np.float32).reshape(-1)


def group_segments_by_speaker(segments: list) -> dict:
    grouped: dict = {}
    for seg in segments:
        grouped.setdefault(seg["speaker"], []).append(seg)
    return grouped


def concat_segments_waveform(waveform, sample_rate: int, segments: list, max_seconds: float = MAX_ENROLL_SECONDS):
    """Concatenates a speaker's segments (in order, up to max_seconds total)
    into a single (1, time) tensor, for a representative embedding/playback clip."""
    import torch

    pieces = []
    accumulated = 0.0
    for seg in sorted(segments, key=lambda s: s["start"]):
        if accumulated >= max_seconds:
            break
        start = seg["start"]
        end = min(seg["end"], start + (max_seconds - accumulated))
        start_sample = max(0, int(start * sample_rate))
        end_sample = min(waveform.shape[-1], int(end * sample_rate))
        if end_sample <= start_sample:
            continue
        pieces.append(waveform[:, start_sample:end_sample])
        accumulated += (end_sample - start_sample) / sample_rate

    if not pieces:
        raise ValueError("No usable audio found for this speaker's segments.")

    return torch.cat(pieces, dim=1)
