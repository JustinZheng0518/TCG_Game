#!/usr/bin/env python3
"""Collect pinned upstream metadata without executing upstream code (stdlib only)."""
import argparse
import collections
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "pokemon": {
        "repository": "PokemonTCG/pokemon-tcg-data",
        "commit": "39a26a144c8b6ef6c2fb17b2c29d0bb7121e3a11",
        "sha256": "ea53e5dff983df11c002b25c58c595586c5744ba4bc04e480bbbb7ab41ddd681",
    },
    "tcgdex": {
        "repository": "tcgdex/cards-database",
        "commit": "af57972e8f784c2507ab9e573c99bf02ae2e5e42",
        "sha256": "96669c788ed908b97b43726dc8aaf8635412e03fcba2bcd9b91d3bd4595a7da8",
    },
}


def archive(name, cache):
    source = SOURCES[name]
    path = cache / f"{name}.zip"
    if not path.exists():
        url = f"https://codeload.github.com/{source['repository']}/zip/{source['commit']}"
        with urllib.request.urlopen(url, timeout=90) as response:
            content = response.read()
        if hashlib.sha256(content).hexdigest() != source["sha256"]:
            raise ValueError(f"{name}: archive checksum mismatch; investigate upstream archive changes")
        path.write_bytes(content)
    if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
        raise ValueError(f"{name}: cached archive checksum mismatch")
    return zipfile.ZipFile(path)


def json_file(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def json_lines(path, records):
    # Fixed gzip header makes repeated collection byte-for-byte reproducible.
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8") as text:
                for record in records:
                    text.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


STRING = r'''(?P<q>["'])(?P<value>(?:\\.|(?!(?P=q)).)*)(?P=q)'''
TOKEN = re.compile(r'''//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]|[A-Za-z_$][\w$-]*\s*:''', re.S)


def property_value(text, key):
    """Locate a root object property; e.g. Indonesian name.id is not the set id."""
    start = re.search(r"\bconst\b[^=]*=\s*\{", text)
    if not start:
        return ""
    depth = 1
    for token in TOKEN.finditer(text, start.end()):
        value = token[0]
        if value == "{":
            depth += 1
        elif value == "}":
            depth -= 1
            if depth == 0:
                break
        elif depth == 1 and value.rstrip().endswith(":"):
            if value.rstrip()[:-1].strip() == key:
                return text[token.end():]
        elif depth == 1 and value in (f'"{key}"', f"'{key}'"):
            colon = re.match(r"\s*:", text[token.end():])
            if colon:
                return text[token.end() + colon.end():]
    return ""


def scalar(text, key):
    match = re.match(r"\s*" + STRING, property_value(text, key))
    if not match:
        return None
    # Preserve non-ASCII text; handle the quote escapes used by upstream names.
    return match["value"].replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")


def translations(text, key="name"):
    match = re.match(r"\s*\{(.*?)\}", property_value(text, key), re.S)
    if not match:
        return {}
    result = {}
    for entry in re.finditer(r'''(?<![\w-])["']?([a-z]{2}(?:-[a-z]{2})?)["']?\s*:\s*''' + STRING, match[1]):
        result[entry[1]] = entry["value"].replace("\\'", "'").replace('\\"', '"')
    return result


def collect(cache, output):
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    with archive("pokemon", cache) as z:
        names = z.namelist()
        sets = json.loads(z.read(next(n for n in names if n.endswith("/sets/en.json"))))
        sets_by_id = {s["id"]: s for s in sets}
        english = []
        for name in sorted(names):
            if not re.search(r"/cards/en/[^/]+\.json$", name):
                continue
            set_id = Path(name).stem
            for card in json.loads(z.read(name)):
                english.append({
                    "id": "pokemontcg:en:" + card["id"],
                    "source_id": card["id"], "language": "en", "game": "pokemon-tcg",
                    "name": card["name"], "set_id": set_id,
                    "set_name": sets_by_id[set_id]["name"],
                    "release_date": sets_by_id[set_id]["releaseDate"].replace("/", "-"),
                    "number": card.get("number"), "rarity": card.get("rarity"),
                    "images": card.get("images", {}),
                    "image_status": "upstream_url_not_downloaded",
                    "source": "https://github.com/PokemonTCG/pokemon-tcg-data",
                })
        assert len({c["id"] for c in english}) == len(english)
        json_file(output / "pokemon-english-sets.json", sets)
        json_lines(output / "pokemon-english.jsonl.gz", english)
        (output / "pokemon-source-README.md").write_bytes(z.read(next(n for n in names if n.endswith("/README.md"))))

    records, unresolved, set_metadata = [], [], {}
    with archive("tcgdex", cache) as z:
        names = z.namelist()
        root = names[0].split("/")[0]
        for name in names:
            match = re.match(re.escape(root) + r"/(data(?:-asia)?)/([^/]+)/([^/]+)\.ts$", name)
            if not match:
                continue
            folder, series, set_name = match.groups()
            text = z.read(name).decode("utf-8")
            series_text = z.read(f"{root}/{folder}/{series}.ts").decode("utf-8")
            set_metadata[(folder, series, set_name)] = {
                "id": scalar(text, "id"), "names": translations(text),
                "series_id": scalar(series_text, "id"),
                "release_date": scalar(text, "releaseDate") or translations(text, "releaseDate"),
            }
        for name in sorted(names):
            match = re.match(re.escape(root) + r"/(data(?:-asia)?)/([^/]+)/([^/]+)/([^/]+)\.ts$", name)
            if not match:
                continue
            folder, series, set_name, number = match.groups()
            text = z.read(name).decode("utf-8")
            metadata = set_metadata.get((folder, series, set_name))
            labels = translations(text)
            if not metadata or not metadata["id"] or not metadata["series_id"] or not labels:
                unresolved.append(name.split("/", 1)[1])
                continue
            set_id, series_id = metadata["id"], metadata["series_id"]
            pocket = series == "Pokémon TCG Pocket"
            records.append({
                "id": f"tcgdex:{folder}:{set_id}:{number}",
                "game": "pokemon-pocket" if pocket else "pokemon-tcg",
                "names": labels, "set_id": set_id, "set_names": metadata["names"],
                "series_id": series_id, "number": number,
                "release_date": metadata["release_date"], "rarity": scalar(text, "rarity"),
                "candidate_images": {
                    lang: {
                        "small": f"https://assets.tcgdex.net/{lang}/{series_id}/{set_id}/{number}/low.webp",
                        "large": f"https://assets.tcgdex.net/{lang}/{series_id}/{set_id}/{number}/high.webp",
                    } for lang in labels
                },
                "image_status": "derived_url_unverified",
                "source_path": name.split("/", 1)[1],
                "source": "https://github.com/tcgdex/cards-database",
            })
        assert len({r["id"] for r in records}) == len(records)
        json_lines(output / "pokemon-multilingual-candidates.jsonl.gz", records)
        for suffix in ["/LICENSE", "/README.md"]:
            path = f"{root}{suffix}"
            if path in names:
                (output / ("tcgdex-" + suffix[1:])).write_bytes(z.read(path))

    counts = collections.Counter(lang for r in records for lang in r["names"])
    summary = {
        "sources": SOURCES,
        "english": {"sets": len(sets), "cards": len(english),
                    "first_set_release": min(c["release_date"] for c in english),
                    "latest_set_release": max(c["release_date"] for c in english),
                    "image_files_downloaded": 0},
        "tcgdex": {"card_records": len(records), "set_records": len(set_metadata),
                   "physical_card_records": sum(r["game"] == "pokemon-tcg" for r in records),
                   "pocket_card_records": sum(r["game"] == "pokemon-pocket" for r in records),
                   "name_records_by_language": dict(sorted(counts.items())),
                   "unresolved_files": unresolved,
                   "note": "Candidate URLs are NOT evidence that images exist. Languages reflect metadata, not verified scans. Overlaps with the English catalog; do not add totals."},
        "basketball": {"cards": 0, "image_files_downloaded": 0,
                       "status": "pending_source_access_and_validation"},
        "complete_historical_coverage": False,
    }
    json_file(output / "summary.json", summary)
    print(json.dumps({"english_cards": len(english), "english_sets": len(sets),
                      "tcgdex_card_records": len(records), "tcgdex_unresolved": len(unresolved),
                      "languages": dict(sorted(counts.items()))}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/workspace/card-source-cache"))
    parser.add_argument("--output", type=Path, default=ROOT / "data/catalogs")
    args = parser.parse_args()
    collect(args.cache, args.output)
