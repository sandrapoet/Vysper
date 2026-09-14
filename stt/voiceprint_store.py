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

# Margen minimo que el mejor candidato debe sacarle al segundo para que su
# nombre se considere identificado. Superar el umbral NO alcanza: medido en
# vivo sobre reunion-2026-09-09-15-46-31, un cluster dio
#   0.608  Axel Manuel Medrano Sanchez   <- elegido
#   0.606  Andre Santa
# o sea 0.002 de diferencia, y la minuta salio afirmando que hablo Axel
# cuando era Andre. En la misma reunion los aciertos ganaron por +0.357 y
# +0.182: cuando la voz de verdad coincide, el margen es de otro orden de
# magnitud. Un empate asi no es una identificacion, es ruido, y en una minuta
# que se lee como un hecho es peor que dejar SPEAKER_XX -- el humano puede
# resolver una etiqueta generica con /reconocerVozPendientes, pero no puede
# adivinar que un nombre concreto y plausible esta mal.
DEFAULT_MIN_MARGIN = 0.05

# Cuanto audio del cluster se usa para IDENTIFICAR. Distinto de
# MAX_ENROLL_SECONDS (que acota el clip representativo que se guarda al
# enrolar): al identificar conviene toda la evidencia disponible, porque el
# embedding de 20 s de voz entrecortada discrimina mucho peor. En esa misma
# reunion habia 122 s de voz de un hablante y solo se miraban los primeros 20.
MAX_MATCH_SECONDS = 60.0


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


def match_min_margin() -> float:
    try:
        return float(os.getenv("VYSPER_VOICEPRINT_MIN_MARGIN", DEFAULT_MIN_MARGIN))
    except ValueError:
        return DEFAULT_MIN_MARGIN


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


def rank_speakers(embedding: np.ndarray, store: dict) -> list:
    """[(name, best_score), ...] ordenado de mayor a menor, un solo score por
    persona (el de su muestra mas parecida). Sirve para decidir con el
    contexto completo -- quien quedo segundo y a que distancia -- en vez de
    solo con el maximo absoluto."""
    ranking = []
    for name, entry in store.items():
        samples = entry.get("embeddings", [])
        if not samples:
            continue
        ranking.append((
            name,
            max(_cosine_similarity(embedding, np.array(sample, dtype=np.float32)) for sample in samples)
        ))
    ranking.sort(key=lambda item: item[1], reverse=True)
    return ranking


def match_speaker(embedding: np.ndarray, store: dict, threshold: float = None, min_margin: float = None):
    """Returns (name, score) for the best match, or (None, best_score) when no
    name can be claimed.

    Se exigen DOS condiciones, no una: que el mejor candidato supere el umbral
    y que le saque `min_margin` al segundo. Sin la segunda, dos personas
    separadas por milesimas se resolvian a favor de una de ellas con la misma
    confianza que un acierto claro (ver DEFAULT_MIN_MARGIN).
    """
    threshold = match_threshold() if threshold is None else threshold
    min_margin = match_min_margin() if min_margin is None else min_margin

    ranking = rank_speakers(embedding, store)
    if not ranking:
        return None, -1.0

    best_name, best_score = ranking[0]
    if best_score < threshold:
        return None, best_score

    runner_up = ranking[1][1] if len(ranking) > 1 else None
    if runner_up is not None and (best_score - runner_up) < min_margin:
        return None, best_score

    return best_name, best_score


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
