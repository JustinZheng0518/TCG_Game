#!/usr/bin/env python3
"""Resume downloading English Pokemon scans; never treat metadata as downloaded images."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def image_extension(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n") and data.endswith(b"\x00\x00\x00\x00IEND\xaeB`\x82"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP" and int.from_bytes(data[4:8], "little") + 8 == len(data):
        return ".webp"
    raise ValueError("Response is not a recognized complete PNG/JPEG/WebP file")


def download(args):
    with gzip.open(args.catalog, "rt", encoding="utf-8") as source:
        cards = [json.loads(line) for line in source]
    if args.set:
        cards = [card for card in cards if card["set_id"] == args.set]
    if not args.all:
        cards = cards[:args.limit]
    if not cards:
        raise ValueError("No cards selected; check --set and --limit")
    args.output.mkdir(parents=True, exist_ok=True)
    ledger_path = args.output / "download-index.jsonl"
    existing = {}
    if ledger_path.exists():
        for line in ledger_path.read_text(encoding="utf-8").splitlines():
            entry = json.loads(line)
            existing[(entry["id"], entry["size"])] = entry
    completed = 0
    with ledger_path.open("a", encoding="utf-8") as ledger:
        for card in cards:
            previous = existing.get((card["id"], args.size))
            if previous:
                path = args.output / previous["file"]
                if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == previous["sha256"]:
                    completed += 1
                    continue
            url = card["images"].get(args.size)
            if not url:
                raise ValueError(f"{card['id']}: no {args.size} image URL")
            request = urllib.request.Request(url, headers={"User-Agent": "TCG-Game-AssetCollector/0.1"})
            # A 403/429 stops the run; no proxy workarounds or repeated denied requests.
            with urllib.request.urlopen(request, timeout=40) as response:
                if not response.headers.get("Content-Type", "").startswith("image/"):
                    raise ValueError(f"{card['id']}: non-image Content-Type")
                data = response.read(20 * 1024 * 1024 + 1)
            if len(data) > 20 * 1024 * 1024:
                raise ValueError("Image exceeds 20 MiB limit")
            extension = image_extension(data)
            filename = re.sub(r"[^A-Za-z0-9_-]", "_", card["id"]) + "-" + args.size + extension
            target = args.output / filename
            temporary = target.with_suffix(target.suffix + ".part")
            temporary.write_bytes(data)
            temporary.replace(target)
            entry = {"id": card["id"], "size": args.size, "url": url,
                     "file": filename, "bytes": len(data),
                     "sha256": hashlib.sha256(data).hexdigest()}
            ledger.write(json.dumps(entry, ensure_ascii=False) + "\n")
            ledger.flush()
            completed += 1
            print(f"{completed}/{len(cards)} {card['source_id']}", flush=True)
            time.sleep(0.25)
    print(f"Verified local files for {completed} selected cards. See {ledger_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=ROOT / "data/catalogs/pokemon-english.jsonl.gz")
    parser.add_argument("--output", type=Path, default=ROOT / "data/images/pokemon")
    parser.add_argument("--size", choices=["small", "large"], default="small")
    parser.add_argument("--set", help="Only download a set, for example base1")
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--limit", type=int, default=20)
    selection.add_argument("--all", action="store_true")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    try:
        download(args)
    except (urllib.error.URLError, ValueError, OSError) as error:
        print(f"Download stopped: {error}", file=sys.stderr)
        sys.exit(1)
