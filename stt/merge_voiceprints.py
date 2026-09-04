#!/usr/bin/env python3
"""
One-off maintenance tool: merges duplicate voiceprint entries (typically
name-spelling variants of the same person, e.g. "Bryan Camilo Mosquera
Mateus" vs "Brayan Camilo Mosquera Mateus") into a single canonical entry
carrying all their embedding samples, so future matching draws on every
sample instead of splitting one person across several 1-sample entries.

Usage:
  python stt/merge_voiceprints.py --into "Canonical Name" "Variant A" "Variant B" ...

Backs up voiceprints.json (timestamped, alongside the original) before
writing.
"""

import argparse
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import voiceprint_store as vp


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge duplicate voiceprint entries into one canonical name.")
    parser.add_argument("--into", required=True, help="Canonical name all listed entries are merged into")
    parser.add_argument("variants", nargs="+", help="Existing store keys to merge (canonical name may be included)")
    args = parser.parse_args()

    store = vp.store_path()
    if not store.exists():
        print(f"No existe el store: {store}", file=sys.stderr)
        return 1

    backup = store.with_name(f"{store.name}.bak-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")
    shutil.copy2(store, backup)

    data = vp.load_store(store)
    missing = [name for name in args.variants if name not in data]
    if missing:
        print(f"No estan en el store: {missing}", file=sys.stderr)
        return 1

    merged_entry = data.setdefault(args.into, {"embeddings": [], "updated": None})
    total_before = len(merged_entry["embeddings"])

    for name in args.variants:
        if name == args.into:
            continue
        entry = data.pop(name)
        merged_entry["embeddings"].extend(entry.get("embeddings", []))

    merged_entry["updated"] = datetime.now(timezone.utc).isoformat()
    vp.save_store(data, store)

    print(f"Fusionado en '{args.into}': {total_before} -> {len(merged_entry['embeddings'])} muestra(s). Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
