#!/usr/bin/env python3
"""Prepare genuine Simplified Chinese Pokemon card faces, organized by source set code."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import sys
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "duanxr/PTCG-CHS-Datasets"
COMMIT = "c3b6ac6ef803aad9d60e44d058359addf3a20883"
METADATA_SHA256 = "908e3be3093bc2fe6065c9fc7a657972462be2cc2ee5d1acb41e85b581b2421b"
METADATA_GIT_BLOB = "edaa6ee2e8116edd055b5048068155581bb48eef"
IMAGE_GIT_TREE = "56a44f7831419a29711ce4399bffd8601986374c"
RAW = f"https://raw.githubusercontent.com/{REPOSITORY}/{COMMIT}/"
DATA = ROOT / "data/pokemon/zh-CN"
IMAGES = ROOT / "data/images/pokemon/zh-CN"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode()
    if path.exists() and path.read_bytes() == content:
        return
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(content)
    temporary.replace(path)


def blob_hash(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def metadata(cache):
    path = cache / "chs-ptcg_chs_infos.json"
    if not path.exists():
        with urllib.request.urlopen(RAW + "ptcg_chs_infos.json", timeout=90) as response:
            content = response.read()
        if hashlib.sha256(content).hexdigest() != METADATA_SHA256:
            raise ValueError("Source metadata SHA-256 mismatch")
        path.write_bytes(content)
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != METADATA_SHA256 or blob_hash(content) != METADATA_GIT_BLOB:
        raise ValueError("Source metadata does not match the pinned Git snapshot")
    return json.loads(content)


def get_archive(cache):
    path = cache / "ptcg-chs-datasets.zip"
    if path.exists():
        return path
    url = f"https://codeload.github.com/{REPOSITORY}/zip/{COMMIT}"
    temporary = path.with_suffix(".zip.part")
    if temporary.exists():
        raise ValueError(f"An archive transfer may still be active: {temporary}; inspect it before retrying")
    total, last, started = 0, 0, time.monotonic()
    with urllib.request.urlopen(url, timeout=90) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > 8 * 1024**3:
                raise ValueError("Archive exceeds the 8 GiB transfer budget")
            output.write(chunk)
            if total - last >= 128 * 1024**2:
                print(f"Downloaded {total // 1024**2} MiB ({time.monotonic() - started:.0f}s)", flush=True)
                last = total
    temporary.replace(path)
    return path


def image_paths(collection, card):
    source = PurePosixPath(card["image"])
    if not re.fullmatch(r"img/[0-9]+/[0-9]+\.png", str(source)):
        raise ValueError(f"Unexpected source image path: {source}")
    filename = source.name
    return f"{collection['commodityCode']}/{filename}", f"{collection['commodityCode']}/{source.stem}.webp"


def build_catalog(source):
    sets, seen = [], set()
    total, unique_cards = 0, set()
    for collection in source["collections"]:
        code = collection["commodityCode"]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", code) or code in seen:
            raise ValueError(f"Unsafe or duplicate set code: {code}")
        seen.add(code)
        cards = []
        card_ids = set()
        for card in collection["cards"]:
            if card["id"] in card_ids:
                raise ValueError(f"Duplicate card id in {code}: {card['id']}")
            card_ids.add(card["id"])
            unique_cards.add(card["id"])
            detail = card["details"]
            original, thumb = image_paths(collection, card)
            cards.append({
                "id": f"{code}:{card['id']}", "source_card_id": card["id"],
                "set_id": code, "language": "zh-CN", "name": card["name"],
                "number": detail["collectionNumber"], "rarity": detail["rarityText"],
                "variant_code": detail.get("special_shiny_type"),
                "type": detail.get("cardTypeText"), "hp": detail.get("hp"),
                "regulation_mark": detail.get("regulationMarkText"),
                "illustrators": detail.get("illustratorName", []),
                "image": "data/images/pokemon/zh-CN/" + original,
                "thumbnail": "data/images/pokemon/zh-CN/" + thumb,
                "source_image": card["image"], "source_url": RAW + card["image"],
                "language_basis": "simplified_chinese_source_dataset",
            })
        cards.sort(key=lambda c: (c["number"].split("/")[0], c["source_card_id"]))
        numbers = {c["number"] for c in cards}
        entry = {
            "id": code, "name": collection["name"].strip(), "language": "zh-CN",
            "release_date": collection.get("salesDate"),
            "series": collection.get("seriesText") or "特典与活动",
            "source_collection_id": collection["id"],
            "source_goods_type": collection.get("goodsType"),
            "card_faces": len(cards), "distinct_card_numbers": len(numbers),
            "variant_faces": len(cards) - len(numbers),
            "cards_path": f"data/pokemon/zh-CN/sets/{code}/cards.json",
            "source": f"https://github.com/{REPOSITORY}/tree/{COMMIT}",
        }
        write_json(DATA / f"sets/{code}/set.json", entry)
        write_json(DATA / f"sets/{code}/cards.json", cards)
        sets.append(entry)
        total += len(cards)
    index = {
        "schema_version": 1, "language": "zh-CN", "source_repository": REPOSITORY,
        "source_commit": COMMIT, "metadata_sha256": METADATA_SHA256,
        "set_count": len(sets), "card_faces": total,
        "unique_source_card_ids": len(unique_cards),
        "note": "商品/set 使用上游独立代码；同卡号的闪卡版本保留。同一卡片在不同商品中可能重复列出。",
        "sets": sets,
    }
    write_json(DATA / "index.json", index)
    write_json(DATA / "source-dictionaries.json", source["dict"])
    return index


def git_tree_hash(blobs):
    """Reconstruct Git trees from the ZIP rather than trusting a self-made file checksum."""
    trees = {"": {}}
    for path, sha in blobs.items():
        parts = PurePosixPath(path).parts
        for index in range(len(parts) - 1):
            directory = "/".join(parts[:index + 1])
            trees.setdefault(directory, {})
        parent = "/".join(parts[:-1])
        trees[parent][parts[-1]] = ("100644", sha)
    for directory in sorted(trees, key=lambda value: value.count("/") + bool(value), reverse=True):
        payload = b""
        entries = trees[directory]
        for name, (mode, sha) in sorted(entries.items(), key=lambda pair: (pair[0] + ("/" if pair[1][0] == "40000" else "")).encode()):
            payload += mode.encode() + b" " + name.encode() + b"\0" + bytes.fromhex(sha)
        sha = hashlib.sha1(b"tree " + str(len(payload)).encode() + b"\0" + payload).hexdigest()
        if directory:
            parent, _, name = directory.rpartition("/")
            trees[parent][name] = ("40000", sha)
        else:
            return sha


def save_image(data, original, thumbnail):
    from PIL import Image
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        width, height = image.size
        if width < 150 or height < 200 or image.format != "PNG":
            raise ValueError(f"Invalid source card dimensions or format: {original}")
        original.parent.mkdir(parents=True, exist_ok=True)
        if original.exists():
            if hashlib.sha256(original.read_bytes()).digest() != hashlib.sha256(data).digest():
                raise ValueError(f"Existing card image differs; refusing to overwrite: {original}")
        else:
            original.write_bytes(data)
        thumb_valid = False
        if thumbnail.exists():
            try:
                with Image.open(thumbnail) as existing:
                    existing.verify()
                    thumb_valid = True
            except (OSError, ValueError):
                pass
        if not thumb_valid:
            image.convert("RGBA").save(thumbnail.with_suffix(".webp.part"), format="WEBP", quality=86, method=3)
            thumbnail.with_suffix(".webp.part").replace(thumbnail)
    return {"image": original.relative_to(ROOT).as_posix(),
            "thumbnail": thumbnail.relative_to(ROOT).as_posix(),
            "width": width, "height": height, "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "git_blob": blob_hash(data),
            "thumbnail_bytes": thumbnail.stat().st_size}


def prepare_images(source, archive_path, workers):
    targets = {}
    for collection in source["collections"]:
        for card in collection["cards"]:
            original, thumb = image_paths(collection, card)
            targets[card["image"]] = (IMAGES / original, IMAGES / thumb)
    results, blobs, missing, extra, pending = {}, {}, [], [], {}
    with zipfile.ZipFile(archive_path) as archive, ThreadPoolExecutor(max_workers=workers) as pool:
        names = archive.namelist()
        prefix = names[0].split("/")[0] + "/"
        content = archive.read(prefix + "ptcg_chs_infos.json")
        if hashlib.sha256(content).hexdigest() != METADATA_SHA256:
            raise ValueError("Archive metadata differs from the pinned source")
        source_doc = archive.read(prefix + "README.md")
        doc = ROOT / "docs/sources/PTCG-CHS-Datasets-README.md"
        doc.parent.mkdir(parents=True, exist_ok=True)
        doc.write_bytes(source_doc)
        image_entries = [info for info in archive.infolist() if info.filename.startswith(prefix + "img/") and not info.is_dir()]

        def reap(done):
            for future in done:
                source_path = pending.pop(future)
                results[source_path] = future.result()
            if len(results) % 1000 < len(done):
                print(f"Verified and prepared {len(results)}/{len(targets)} card faces", flush=True)

        for info in image_entries:
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Unexpected symlink in source archive")
            if info.file_size > 20 * 1024**2:
                raise ValueError(f"Oversized source image: {info.filename}")
            data = archive.read(info)  # ZipFile verifies the entry's CRC.
            relative = info.filename[len(prefix):]
            blobs[relative[len("img/"):]] = blob_hash(data)
            if relative not in targets:
                extra.append(relative)
                continue
            original, thumb = targets[relative]
            pending[pool.submit(save_image, data, original, thumb)] = relative
            if len(pending) >= workers * 3:
                done, _ = wait(pending, return_when=FIRST_COMPLETED)
                reap(done)
        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)
            reap(done)
    actual_tree = git_tree_hash(blobs)
    if actual_tree != IMAGE_GIT_TREE:
        raise ValueError(f"Source image Git tree mismatch: expected {IMAGE_GIT_TREE}, got {actual_tree}. Images must not be used until investigated.")
    for path in targets:
        if path not in results:
            missing.append(path)
    write_json(DATA / "image-manifest.json", {
        "source_commit": COMMIT, "source_image_git_tree": actual_tree,
        "verified_image_tree": True, "images": dict(sorted(results.items())),
        "missing_source_paths": missing, "non_card_source_paths": sorted(extra),
    })
    if missing:
        raise ValueError(f"{len(missing)} referenced card faces are missing from the archive")


def report(index):
    manifest_path = DATA / "image-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"images": {}}
    verified = manifest.get("verified_image_tree") is True
    rows, missing = [], []
    for entry in index["sets"]:
        cards = json.loads((ROOT / entry["cards_path"]).read_text())
        present = 0
        for card in cards:
            proof = manifest["images"].get(card["source_image"])
            if verified and proof and (ROOT / proof["image"]).is_file() and (ROOT / proof["thumbnail"]).is_file():
                present += 1
            else:
                missing.append({"set_id": entry["id"], "id": card["id"], "name": card["name"],
                                "number": card["number"], "rarity": card["rarity"],
                                "source_path": card["source_image"]})
        rows.append({"id": entry["id"], "name": entry["name"], "card_faces": len(cards),
                     "local_card_faces": present, "missing": len(cards) - present})
    result = {"language": "zh-CN", "source_commit": COMMIT,
              "sets": len(rows), "card_faces": index["card_faces"],
              "local_card_faces": sum(row["local_card_faces"] for row in rows),
              "missing_card_faces": len(missing), "source_image_git_tree_verified": verified,
              "complete_against_pinned_source": verified and not missing,
              "all_historical_releases_guaranteed": False,
              "original_bytes": sum(image["bytes"] for image in manifest["images"].values()),
              "thumbnail_bytes": sum(image["thumbnail_bytes"] for image in manifest["images"].values()),
              "source_dimensions": dict(Counter(f"{image['width']}x{image['height']}" for image in manifest["images"].values())),
              "image_resolution": "Native source resolution; no AI upscaling or translated substitute faces",
              "per_set": rows}
    write_json(DATA / "coverage.json", result)
    write_json(DATA / "missing-images.json", missing)
    lines = ["# 简体中文宝可梦 set 清单", "",
             f"固定来源：{COMMIT}。共 {len(rows)} 个商品/set、{index['card_faces']:,} 条卡面记录；本地已校验 {result['local_card_faces']:,} 条，缺图 {len(missing):,} 条。", "",
             "同一卡号不同闪卡保留；跨商品重复收录不代表不同卡片。", "",
             "| Set 代码 | 名称 | 发行日期 | 不同卡号 | 卡面及变体 | 缺图 |", "| --- | --- | --- | ---: | ---: | ---: |"]
    for entry, row in zip(index["sets"], rows):
        name = entry["name"].replace("|", "\\|").replace("\n", " ")
        lines.append(f"| [{entry['id']}](../data/pokemon/zh-CN/sets/{entry['id']}/cards.json) | {name} | {entry['release_date'] or '未记录'} | {entry['distinct_card_numbers']} | {entry['card_faces']} | {row['missing']} |")
    (ROOT / "docs/简中套装清单.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "per_set"}, ensure_ascii=False, indent=2), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["catalog", "prepare", "report"])
    parser.add_argument("--cache", type=Path, default=Path("/workspace/card-source-cache"))
    parser.add_argument("--workers", type=int, default=4, choices=range(1, 9))
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    if args.action == "report":
        report(json.loads((DATA / "index.json").read_text()))
        return
    source = metadata(args.cache)
    index = build_catalog(source)
    print(f"Catalog: {index['set_count']} sets; {index['card_faces']} card faces", flush=True)
    if args.action == "prepare":
        if not (args.cache / "ptcg-chs-datasets.zip").exists() and (args.cache / "ptcg-chs-datasets.zip.part").exists():
            from recover_cn_archive import recover_images
            recover_images(source, args.cache, args.workers)
        else:
            prepare_images(source, get_archive(args.cache), args.workers)
    report(index)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        print(f"Asset preparation failed: {error}", file=sys.stderr)
        sys.exit(1)
