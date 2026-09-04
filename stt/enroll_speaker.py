#!/usr/bin/env python3
"""
Speaker enrollment: turns diarization clusters from a past session into named
voiceprints, so future diarize.py runs can resolve SPEAKER_XX to real names
automatically.

Interactive usage (terminal, asks for each name via stdin):
  python stt/enroll_speaker.py /path/to/speakers-full.json
  python stt/enroll_speaker.py /path/to/speakers-full.json --audio /path/to/original.wav

Non-interactive usage (driven by the Vysper app's /reconocerVoz chat command,
see main.js runReconocerVozCommand/resolvePendingVoiceEnrollment): the work is
split into a "prepare" step (one heavy pass: diarize clusters, extract a clip
+ embedding per unresolved speaker) and a "commit" step (cheap: just saves one
name against an already-computed embedding), so the app can ask about one
speaker at a time across separate chat messages without reloading the
embedding model each time.

  python stt/enroll_speaker.py --list-json <speakers.json> --audio <audio> \\
      --out <prepare.json> --embeddings-cache <embeddings.json>

  python stt/enroll_speaker.py --commit <embeddings.json> \\
      --speaker-label <SPEAKER_LABEL> --name "<Nombre>"

The diarization JSON (produced by diarize.py) already carries "audioPath";
--audio overrides it in case the file moved.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import voiceprint_store as vp
from diarize import _get_token, _load_repo_env, _resolve_device, _load_audio_for_pyannote

PLAYERS = ("paplay", "aplay", "ffplay")


def _write_wav_clip(waveform, sample_rate: int, path: Path) -> None:
    # torchaudio.save() defaults to a torchcodec backend that isn't installed
    # correctly in this venv (same issue diarize.py avoids for reading, see
    # _load_audio_for_pyannote). Writing PCM16 by hand via the stdlib "wave"
    # module sidesteps it entirely, matching sidecar.py's own approach.
    import wave
    import numpy as np

    samples = waveform.squeeze(0).numpy()
    pcm16 = (np.clip(samples, -1.0, 1.0) * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(pcm16.tobytes())


def _try_play(path: Path) -> bool:
    player = next((p for p in PLAYERS if shutil.which(p)), None)
    if not player:
        return False
    cmd = [player, "-nodisp", "-autoexit", str(path)] if player == "ffplay" else [player, str(path)]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        return True
    except Exception:
        return False


def _load_speakers_and_audio(speakers_json: Path, audio_override: str = None):
    payload = json.loads(speakers_json.read_text(encoding="utf-8"))
    segments = payload.get("segments") or []
    if not segments:
        raise ValueError("El JSON de diarizacion no tiene segments.")

    audio_path = Path(audio_override).expanduser().resolve() if audio_override else Path(payload["audioPath"])
    if not audio_path.exists():
        raise FileNotFoundError(f"No existe el audio: {audio_path}")

    return segments, audio_path


def prepare_unresolved_clusters(speakers_json: Path, audio_override: str, scratch_dir: Path, only_speakers: set = None) -> list:
    """One heavy pass over a diarized session: groups segments by speaker
    cluster, skips clusters that already match someone in the voiceprints
    store, and for the rest writes a representative audio clip + computes its
    embedding. Returns a list of dicts with everything needed to ask the user
    for a name later, without reloading the audio or the embedding model.

    only_speakers: if given, only these cluster labels are considered at all
    (used by /reconocerVozPendientes to retry just the ones already marked
    UNKNOWN in a session, without touching untouched or already-named ones).
    """
    segments, audio_path = _load_speakers_and_audio(speakers_json, audio_override)

    token = _get_token()
    if not token:
        raise RuntimeError("Falta VYSPER_PYANNOTE_TOKEN / HF_TOKEN.")
    device = _resolve_device()

    loaded = _load_audio_for_pyannote(audio_path)
    waveform, sample_rate = loaded["waveform"], loaded["sample_rate"]

    store = vp.load_store()
    grouped = vp.group_segments_by_speaker(segments)
    if only_speakers:
        grouped = {label: segs for label, segs in grouped.items() if label in only_speakers}
    scratch_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for speaker_label, speaker_segments in sorted(grouped.items()):
        total_duration = sum(s["end"] - s["start"] for s in speaker_segments)

        try:
            clip = vp.concat_segments_waveform(waveform, sample_rate, speaker_segments)
            embedding = vp.extract_embedding(clip, sample_rate, 0.0, clip.shape[-1] / sample_rate, token, device)
        except Exception as exc:
            results.append({
                "speaker": speaker_label,
                "duration": round(total_duration, 1),
                "segments": len(speaker_segments),
                "skipped": str(exc),
            })
            continue

        existing_name, score = vp.match_speaker(embedding, store)
        if existing_name:
            results.append({
                "speaker": speaker_label,
                "duration": round(total_duration, 1),
                "segments": len(speaker_segments),
                "already_matched": existing_name,
                "score": round(score, 3),
            })
            continue

        clip_path = scratch_dir / f"{speaker_label}.wav"
        _write_wav_clip(clip, sample_rate, clip_path)

        results.append({
            "speaker": speaker_label,
            "duration": round(total_duration, 1),
            "segments": len(speaker_segments),
            "clip": str(clip_path),
            "score": round(score, 3),
            "embedding": embedding.tolist(),
        })

    return results


def _cmd_list_json(args) -> int:
    _load_repo_env()

    speakers_path = Path(args.list_json).expanduser().resolve()
    if not speakers_path.exists():
        print(json.dumps({"error": f"No existe: {speakers_path}"}), file=sys.stderr)
        return 1

    scratch_dir = Path(args.out).expanduser().resolve().parent
    only_speakers = set(s.strip() for s in args.only_speakers.split(",") if s.strip()) if args.only_speakers else None
    try:
        clusters = prepare_unresolved_clusters(speakers_path, args.audio, scratch_dir, only_speakers)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1

    embeddings_cache = {c["speaker"]: c.pop("embedding") for c in clusters if "embedding" in c}
    pending = [c for c in clusters if "clip" in c]

    Path(args.embeddings_cache).expanduser().resolve().write_text(
        json.dumps(embeddings_cache, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    Path(args.out).expanduser().resolve().write_text(
        json.dumps({"clusters": pending, "all": clusters}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return 0


def _cmd_commit(args) -> int:
    _load_repo_env()

    cache_path = Path(args.commit).expanduser().resolve()
    if not cache_path.exists():
        print(json.dumps({"error": f"No existe: {cache_path}"}), file=sys.stderr)
        return 1

    embeddings_cache = json.loads(cache_path.read_text(encoding="utf-8"))
    embedding = embeddings_cache.get(args.speaker_label)

    if embedding is None:
        print(json.dumps({"error": f"No hay embedding cacheado para {args.speaker_label}"}), file=sys.stderr)
        return 1

    import numpy as np

    store = vp.load_store()

    # A typo-only variant of an already-enrolled name (e.g. "Bryan Camilo
    # Mosquera Mateus" vs "Brayan Camilo Mosquera Mateus") used to silently
    # fork a brand new 1-sample voiceprint instead of strengthening the
    # person's existing entry -- that fragmentation is what made later
    # matching unreliable. An exact match (modulo case/accents) is folded in
    # automatically; a fuzzy-but-not-exact one is flagged back to the caller
    # (this call is non-interactive, so we don't silently merge two possibly
    # different people) but still commits under the name given.
    exact_match = vp.find_exact_name(store, args.name)
    canonical_name = exact_match or args.name
    # Only worth checking for a fuzzy near-duplicate when there was no exact
    # match at all -- comparing canonical_name to args.name doesn't work for
    # this because they're trivially equal both when there's no exact match
    # (canonical_name falls back to args.name) AND when the exact match found
    # happens to be spelled identically to args.name (the common case of
    # re-enrolling someone under the same name), which used to misfire this
    # warning on a plain, correct re-enrollment.
    similar = [] if exact_match else vp.find_similar_names(store, args.name)

    vp.upsert_voiceprint(store, canonical_name, np.array(embedding, dtype="float32"))
    vp.save_store(store)

    result = {
        "speaker": args.speaker_label,
        "name": canonical_name,
        "totalSamples": len(store[canonical_name]["embeddings"]),
    }
    if similar:
        result["warning"] = (
            f"'{args.name}' se parece a un nombre ya enrolado ({', '.join(similar)}). "
            "Se guardo como entrada nueva -- revisa si es la misma persona y fusiona las huellas si corresponde."
        )
        result["similarTo"] = similar
    print(json.dumps(result, ensure_ascii=False))
    return 0


def _cmd_interactive(args) -> int:
    _load_repo_env()

    speakers_path = Path(args.speakers_json).expanduser().resolve()
    if not speakers_path.exists():
        print(f"No existe: {speakers_path}", file=sys.stderr)
        return 1

    scratch_dir = Path.home() / ".Vysper" / "enroll-scratch"
    try:
        clusters = prepare_unresolved_clusters(speakers_path, args.audio, scratch_dir)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    store = vp.load_store()
    enrolled_this_run = {}

    for cluster in clusters:
        speaker_label = cluster["speaker"]

        if cluster.get("skipped"):
            print(f"{speaker_label}: sin audio usable ({cluster['skipped']}), se omite.")
            continue
        if cluster.get("already_matched"):
            print(f"{speaker_label} ya matchea con '{cluster['already_matched']}' (score={cluster['score']}) — se omite.")
            continue

        print(f"\n=== {speaker_label} — {cluster['duration']}s en {cluster['segments']} segmentos ===")
        print(f"Clip: {cluster['clip']}")
        if not _try_play(Path(cluster["clip"])):
            print("(No se encontro un reproductor en PATH; abre el clip manualmente para escucharlo.)")

        name = input(f"Nombre para {speaker_label} (Enter para omitir): ").strip()
        if not name:
            continue

        exact = vp.find_exact_name(store, name)
        if exact:
            name = exact
        else:
            similar = vp.find_similar_names(store, name)
            if similar:
                choice = input(
                    f"  ¿Es la misma persona que {similar[0]!r}? "
                    "(Enter para usar ese nombre, o escribe otro nombre para crear una entrada nueva): "
                ).strip()
                name = choice if choice else similar[0]

        import numpy as np
        vp.upsert_voiceprint(store, name, np.array(cluster["embedding"], dtype="float32"))
        enrolled_this_run[speaker_label] = name

    if enrolled_this_run:
        vp.save_store(store)
        print("\nEnrolados en esta corrida:")
        for label, name in enrolled_this_run.items():
            total_samples = len(store[name]["embeddings"])
            print(f"  {label} -> {name} ({total_samples} muestra(s) totales)")
    else:
        print("\nNo se enrolo a nadie nuevo en esta corrida.")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Enroll speaker voiceprints from a diarized session.")
    parser.add_argument("speakers_json", nargs="?", help="Path to a speakers-full.json produced by diarize.py")
    parser.add_argument("--audio", help="Override the audio path stored in the diarization JSON")

    parser.add_argument("--list-json", help="Non-interactive: path to a speakers-full.json to prepare for enrollment")
    parser.add_argument("--out", help="Where to write the prepared clusters JSON (used with --list-json)")
    parser.add_argument("--embeddings-cache", help="Where to write cached embeddings JSON (used with --list-json)")
    parser.add_argument("--only-speakers", help="Comma-separated speaker labels to restrict --list-json to (used with --list-json)")

    parser.add_argument("--commit", help="Non-interactive: path to an embeddings-cache JSON written by --list-json")
    parser.add_argument("--speaker-label", dest="speaker_label", help="Used with --commit")
    parser.add_argument("--name", help="Used with --commit")

    args = parser.parse_args()

    if args.list_json:
        if not args.out or not args.embeddings_cache:
            print("--list-json requiere --out y --embeddings-cache", file=sys.stderr)
            return 1
        return _cmd_list_json(args)

    if args.commit:
        if not args.speaker_label or not args.name:
            print("--commit requiere --speaker-label y --name", file=sys.stderr)
            return 1
        return _cmd_commit(args)

    if not args.speakers_json:
        print("Falta la ruta a speakers-full.json", file=sys.stderr)
        return 1
    return _cmd_interactive(args)


if __name__ == "__main__":
    raise SystemExit(main())
