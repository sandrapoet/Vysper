#!/usr/bin/env python3
"""
Re-identifica hablantes en minutas ya generadas, en lote, contra el store de
huellas de voz actual (~/.Vysper/voiceprints.json) -- sin usar un LLM.

A diferencia de /actualizarHablantes (main.js, una sesion a la vez, y que
reescribe minuta.md con una pasada de LLM), este script:
  1. Recorre recursivamente una carpeta con muchas sesiones ya procesadas.
  2. Re-matchea cada diarizacion contra el store actual (mismo mecanismo que
     diarize.py --rematch: no re-clusteriza, solo re-embeddea cada cluster).
  3. Para cada hablante que pasa de generico (SPEAKER_NN/UNKNOWN_NN) a
     identificado, reemplaza el texto de esa etiqueta por el nombre real en
     transcript-hablantes.txt y transcript-teams.txt (reemplazo exacto,
     anclado a inicio de linea -- no puede confundirse con el nombre
     mencionado dentro de una intervencion de otra persona) y, en minuta.md,
     hace un reemplazo best-effort (sin garantia de cobertura total, porque
     ahi los nombres los escribio un LLM al generar la minuta original).

Uso:
  python stt/reidentify_minutas.py --root /media/san/Miscosas6/Creai/minutas
  python stt/reidentify_minutas.py --session "/ruta/a/una/sesion"
"""

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import diarize  # noqa: E402  (debe importarse antes de torch/numpy, ver diarize.py)

DEFAULT_ROOT = Path("/media/san/Miscosas6/Creai/minutas")

# Mismo patron que SECRETARIA_GENERIC_SPEAKER_PATTERN en main.js:130.
GENERIC_SPEAKER_PATTERN = re.compile(
    r"^(speaker[_\s]?\d+|unknown[_\s]?\d+|hablante[_\s]?desconocido|hablante\s*\d*)$",
    re.IGNORECASE,
)
NEVER_REVIEWED_PATTERN = re.compile(r"^SPEAKER_\d+$")


def find_speakers_path(session_dir: Path):
    for rel in ("final/speakers-full.json", "speakers/0001.json"):
        candidate = session_dir / rel
        if candidate.exists():
            return candidate
    return None


def find_audio_path(session_dir: Path, manifest: dict):
    live = session_dir / "final" / "full-audio.wav"
    if live.exists():
        return live

    audio_dir = session_dir / "audio"
    if audio_dir.exists():
        owned = sorted(p for p in audio_dir.iterdir() if p.is_file() and not p.name.startswith("."))
        if owned:
            return owned[0]

    if manifest:
        src = manifest.get("sourceFilePath")
        if src and Path(src).exists():
            return Path(src)

    return None


def load_manifest(session_dir: Path):
    manifest_path = session_dir / "session.json"
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def discover_sessions(root: Path):
    sessions = set()
    for session_json in root.rglob("session.json"):
        sessions.add(session_json.parent)
    for speakers_json in root.rglob("final/speakers-full.json"):
        sessions.add(speakers_json.parent.parent)
    return sorted(sessions)


HABLANTES_TURN_PATTERN = re.compile(r"^([^\n:]+):\s*(.*)$", re.DOTALL)
TEAMS_TURN_PATTERN = re.compile(r"^(\d{2}:\d{2}:\d{2})\s+\*\*(.+?)\*\*\s+(.*)$", re.DOTALL)


def parse_hablantes_turns(text: str):
    turns = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if not block:
            continue
        match = HABLANTES_TURN_PATTERN.match(block)
        if match:
            turns.append((match.group(1).strip(), match.group(2).strip()))
    return turns


def parse_teams_turns(text: str):
    turns = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if not block:
            continue
        match = TEAMS_TURN_PATTERN.match(block)
        if match:
            turns.append((match.group(1), match.group(2).strip(), match.group(3).strip()))
    return turns


def correlate_old_teams_labels(hablantes_text: str, teams_text: str):
    """transcript-hablantes.txt tiene exactamente una linea por turno real de
    diarizacion (solo corta por cambio de hablante, ver mergeTranscriptSegmentsWithSpeakers
    con maxPauseSec=Infinity); transcript-teams.txt puede partir ese mismo turno
    en varias lineas si hay una pausa larga (maxPauseSec=5), pero NUNCA junta
    turnos de hablantes distintos. Por eso, si se colapsan las lineas
    consecutivas de teams.txt que comparten la misma etiqueta en negrita, el
    resultado tiene que tener el mismo numero de 'runs' que lineas tiene
    hablantes.txt, en el mismo orden -- eso permite emparejar con certeza la
    etiqueta cruda (SPEAKER_NN, ya sin adivinar el orden de PARTICIPANTE N a
    partir del JSON, que puede no coincidir con el orden real de turnos)
    con la forma en la que quedo horneada en teams.txt. Si no coincide el
    conteo (u la misma etiqueta cruda mapea a mas de una etiqueta en negrita,
    lo que no deberia pasar), se devuelve None y el llamador no toca
    transcript-teams.txt para esa sesion -- mas vale no tocar nada a
    arriesgarse a reetiquetar mal una intervencion."""
    h_turns = parse_hablantes_turns(hablantes_text)
    t_turns = parse_teams_turns(teams_text)
    if not h_turns or not t_turns:
        return None

    runs = []
    for _, bold_label, _ in t_turns:
        if runs and runs[-1] == bold_label:
            continue
        runs.append(bold_label)

    if len(runs) != len(h_turns):
        return None

    mapping = {}
    for (raw_label, _text), bold_label in zip(h_turns, runs):
        existing = mapping.get(raw_label)
        if existing is None:
            mapping[raw_label] = bold_label
        elif existing != bold_label:
            return None

    return mapping


def backup_file(path: Path) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    bak = path.with_name(f"{path.name}.bak-{ts}")
    shutil.copy2(path, bak)
    return bak


def replace_hablantes_label(text: str, old_label: str, new_name: str):
    escaped = re.escape(old_label)
    pattern = re.compile(rf"^{escaped}:", re.MULTILINE)
    return pattern.subn(f"{new_name}:", text)


def replace_teams_label(text: str, old_bold_label: str, new_name: str):
    escaped = re.escape(old_bold_label)
    pattern = re.compile(rf"(?m)^(\d{{2}}:\d{{2}}:\d{{2}}\s+)\*\*{escaped}\*\*")
    return pattern.subn(rf"\1**{new_name.upper()}**", text)


def replace_minuta_label(text: str, old_label: str, new_name: str):
    escaped = re.escape(old_label)
    pattern = re.compile(rf"\b{escaped}\b", re.IGNORECASE)
    return pattern.subn(new_name, text)


def rewrite_with_backup(path: Path, new_text: str):
    backup_file(path)
    path.write_text(new_text, encoding="utf-8")


def process_session(session_dir: Path):
    report = {"session": str(session_dir), "skipped": None, "resolved": [], "still_unresolved": [],
              "hablantes": None, "teams": None, "minuta": None}

    speakers_path = find_speakers_path(session_dir)
    if not speakers_path:
        report["skipped"] = "sin speakers-full.json / speakers/0001.json"
        return report

    manifest = load_manifest(session_dir)
    audio_path = find_audio_path(session_dir, manifest)
    if not audio_path:
        report["skipped"] = "sin audio localizable (final/full-audio.wav, audio/, sourceFilePath)"
        return report

    try:
        payload_before = json.loads(speakers_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        report["skipped"] = f"no se pudo leer {speakers_path}: {exc}"
        return report

    segments_before = payload_before.get("segments") or []
    if not segments_before:
        report["skipped"] = f"{speakers_path} no tiene segments"
        return report

    # --- rematch (mismo mecanismo que diarize.py --rematch) ---
    try:
        result = diarize.rematch(speakers_path, str(audio_path))
    except Exception as exc:  # noqa: BLE001 - se reporta y se sigue con la siguiente sesion
        report["skipped"] = f"fallo el rematch: {exc}"
        return report

    segments_after = result["segments"]
    if len(segments_after) != len(segments_before):
        report["skipped"] = "el rematch devolvio un numero distinto de segments; se omite por seguridad"
        return report

    resolved_map = {}  # old_label -> new_name
    for idx, seg_before in enumerate(segments_before):
        old_label = seg_before["speaker"]
        if old_label in resolved_map or not GENERIC_SPEAKER_PATTERN.match(old_label):
            continue
        seg_after = segments_after[idx]
        new_label = seg_after.get("speaker")
        if seg_after.get("status") == "MATCHED" and new_label and new_label != old_label:
            resolved_map[old_label] = new_label
            report["resolved"].append({"old": old_label, "new": new_label, "score": seg_after.get("score")})

    # Etiquetas SPEAKER_NN nunca revisadas que siguen sin match tras el
    # rematch se marcan UNKNOWN_NN, igual que runActualizarHablantesCommand
    # (main.js:6931-6941), para que /reconocerVozPendientes las siga
    # ofreciendo sin tratarlas como "nunca analizadas".
    for idx, seg_before in enumerate(segments_before):
        old_label = seg_before["speaker"]
        if not NEVER_REVIEWED_PATTERN.match(old_label):
            continue
        seg_after = segments_after[idx]
        if seg_after.get("status") != "MATCHED":
            suffix = old_label.split("_", 1)[1]
            seg_after["speaker"] = f"UNKNOWN_{suffix}"
            seg_after["status"] = "UNKNOWN"
            if old_label not in {r["old"] for r in report["resolved"]} and old_label not in report["still_unresolved"]:
                report["still_unresolved"].append(old_label)

    rewrite_with_backup(speakers_path, json.dumps(result, ensure_ascii=False, indent=2) + "\n")

    if not resolved_map:
        return report

    final_dir = session_dir / "final"

    hablantes_path = final_dir / "transcript-hablantes.txt"
    teams_path = final_dir / "transcript-teams.txt"

    hablantes_text_before = hablantes_path.read_text(encoding="utf-8") if hablantes_path.exists() else None
    teams_text_before = teams_path.read_text(encoding="utf-8") if teams_path.exists() else None

    # La correlacion se calcula ANTES de tocar transcript-hablantes.txt: se
    # basa en emparejar sus etiquetas crudas (todavia intactas) con las
    # etiquetas en negrita de transcript-teams.txt turno por turno (ver
    # correlate_old_teams_labels) -- no se puede reconstruir de forma segura
    # solo a partir del orden de aparicion en el JSON de diarizacion, porque
    # ese orden no siempre coincide con el orden real de los turnos ya
    # renderizados (un segmento de diarizacion muy corto puede no llegar a
    # dominar ningun turno del transcript).
    old_teams_labels = None
    if hablantes_text_before is not None and teams_text_before is not None:
        old_teams_labels = correlate_old_teams_labels(hablantes_text_before, teams_text_before)

    if hablantes_text_before is not None:
        text = hablantes_text_before
        total = 0
        for old_label, new_name in resolved_map.items():
            text, n = replace_hablantes_label(text, old_label, new_name)
            total += n
        if total:
            rewrite_with_backup(hablantes_path, text)
        report["hablantes"] = total

    if teams_text_before is not None:
        if old_teams_labels is None:
            report["teams"] = "omitido: no se pudo correlacionar de forma segura con transcript-hablantes.txt"
        else:
            text = teams_text_before
            total = 0
            skipped_labels = []
            for old_label, new_name in resolved_map.items():
                old_bold = old_teams_labels.get(old_label)
                if old_bold is None:
                    skipped_labels.append(old_label)
                    continue
                text, n = replace_teams_label(text, old_bold, new_name)
                total += n
            if total:
                rewrite_with_backup(teams_path, text)
            report["teams"] = total
            if skipped_labels:
                report["teams_skipped_labels"] = skipped_labels

    minuta_path = final_dir / "minuta.md"
    if minuta_path.exists():
        text = minuta_path.read_text(encoding="utf-8")
        total = 0
        unmatched = []
        for old_label, new_name in resolved_map.items():
            text, n = replace_minuta_label(text, old_label, new_name)
            total += n
            if n == 0:
                unmatched.append(old_label)
        if total:
            rewrite_with_backup(minuta_path, text)
        report["minuta"] = {"replaced": total, "unmatched_labels": unmatched}

    return report


def print_report(reports):
    print()
    print("=" * 70)
    print("Resumen de reidentificacion")
    print("=" * 70)
    for r in reports:
        print(f"\n- {r['session']}")
        if r["skipped"]:
            print(f"    omitida: {r['skipped']}")
            continue
        if not r["resolved"] and not r["still_unresolved"]:
            print("    sin hablantes genericos pendientes (nada que actualizar)")
            continue
        for item in r["resolved"]:
            score = item["score"]
            score_txt = f"{score:.3f}" if isinstance(score, (int, float)) else "?"
            print(f"    {item['old']} -> {item['new']} (score={score_txt})")
        for label in r["still_unresolved"]:
            print(f"    {label} sigue sin identificar (marcado UNKNOWN)")
        if r["hablantes"] is not None:
            print(f"    transcript-hablantes.txt: {r['hablantes']} reemplazo(s)")
        if isinstance(r["teams"], str):
            print(f"    transcript-teams.txt: {r['teams']}")
        elif r["teams"] is not None:
            print(f"    transcript-teams.txt: {r['teams']} reemplazo(s)")
            if r.get("teams_skipped_labels"):
                joined = ", ".join(r["teams_skipped_labels"])
                print(f"      sin forma horneada conocida en teams.txt: {joined}")
        if r["minuta"] is not None:
            print(f"    minuta.md: {r['minuta']['replaced']} reemplazo(s)")
            if r["minuta"]["unmatched_labels"]:
                joined = ", ".join(r["minuta"]["unmatched_labels"])
                print(f"      etiquetas no encontradas en minuta.md (revisar a mano): {joined}")


def main() -> int:
    diarize._load_repo_env()

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help=f"Carpeta raiz a recorrer (default: {DEFAULT_ROOT})")
    parser.add_argument("--session", help="Procesa solo esta carpeta de sesion (para pruebas), ignora --root")
    args = parser.parse_args()

    if args.session:
        sessions = [Path(args.session).expanduser().resolve()]
    else:
        root = Path(args.root).expanduser().resolve()
        if not root.exists():
            print(f"No existe la carpeta raiz: {root}", file=sys.stderr)
            return 1
        sessions = discover_sessions(root)

    if not sessions:
        print("No se encontraron sesiones para procesar.", file=sys.stderr)
        return 1

    reports = []
    for session_dir in sessions:
        print(f"Procesando {session_dir} ...", file=sys.stderr)
        reports.append(process_session(session_dir))

    print_report(reports)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
