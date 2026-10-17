"""Recover verified files from an interrupted source ZIP and fetch only missing blobs."""
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
import json
from pathlib import Path
import struct
import urllib.request
import zlib

from pokemon_cn import (COMMIT, DATA, IMAGE_GIT_TREE, IMAGES, RAW, REPOSITORY, ROOT,
                       blob_hash, git_tree_hash, image_paths, save_image, write_json)


def image_inventory(cache):
    path = cache / "chs-verified-image-tree.json"
    if path.exists():
        files = json.loads(path.read_text())["files"]
    else:
        base = f"https://api.github.com/repos/{REPOSITORY}/git/trees/"
        with urllib.request.urlopen(base + IMAGE_GIT_TREE, timeout=45) as response:
            root = json.load(response)
        if root.get("truncated") or not all(item["type"] == "tree" for item in root["tree"]):
            raise ValueError("Unexpected or truncated source image tree")

        def get_directory(entry):
            cached = cache / "chs-trees" / (entry["path"] + ".json")
            if cached.exists():
                tree = json.loads(cached.read_text())
            else:
                with urllib.request.urlopen(base + entry["sha"], timeout=45) as response:
                    tree = json.load(response)
                write_json(cached, tree)
            if tree.get("truncated") or any(item["type"] != "blob" or item["mode"] != "100644" for item in tree["tree"]):
                raise ValueError("Unexpected or truncated source directory")
            return {entry["path"] + "/" + item["path"]: {"sha": item["sha"], "size": item.get("size")}
                    for item in tree["tree"]}

        files = {}
        with ThreadPoolExecutor(max_workers=4) as pool:
            for result in pool.map(get_directory, root["tree"]):
                files.update(result)
    if git_tree_hash({path: item["sha"] for path, item in files.items()}) != IMAGE_GIT_TREE:
        raise ValueError("Recovered source inventory does not match the pinned Git image tree")
    write_json(path, {"source_image_git_tree": IMAGE_GIT_TREE, "files": files})
    return {"img/" + path: item for path, item in files.items()}


def partial_entries(path):
    prefix = f"PTCG-CHS-Datasets-{COMMIT}/"
    with path.open("rb") as source:
        while True:
            header = source.read(30)
            if len(header) < 30:
                return
            if header[:4] in (b"PK\x01\x02", b"PK\x05\x06", b"PK\x06\x06"):
                return
            if header[:4] != b"PK\x03\x04":
                raise ValueError("Unexpected ZIP local header; source cache needs inspection")
            _, _, flags, method, _, _, crc, compressed_size, size, name_size, extra_size = struct.unpack("<4s5H3I2H", header)
            if flags & 8 or method not in (0, 8):
                raise ValueError("This ZIP uses an unsupported streaming layout")
            name = source.read(name_size).decode("utf-8")
            source.read(extra_size)
            if not name.startswith(prefix):
                raise ValueError("Partial archive belongs to a different source commit")
            if size > 32 * 1024**2 or compressed_size > 32 * 1024**2:
                raise ValueError("Source archive entry exceeds recovery size budget")
            compressed = source.read(compressed_size)
            if len(compressed) < compressed_size:
                return  # Expected incomplete final entry after an interrupted transfer.
            if method == 8:
                decoder = zlib.decompressobj(-15)
                data = decoder.decompress(compressed, 32 * 1024**2 + 1)
                if not decoder.eof:
                    raise ValueError("Invalid or oversized compressed source entry")
            else:
                data = compressed
            if len(data) != size or zlib.crc32(data) & 0xffffffff != crc:
                raise ValueError(f"Partial ZIP CRC/size mismatch: {name}")
            relative = name[len(prefix):]
            if relative == "README.md":
                doc = ROOT / "docs/sources/PTCG-CHS-Datasets-README.md"
                doc.parent.mkdir(parents=True, exist_ok=True)
                doc.write_bytes(data)
            if relative.startswith("img/") and not name.endswith("/"):
                yield relative, data


def recover_images(source, cache, workers):
    inventory = image_inventory(cache)
    targets = {}
    for collection in source["collections"]:
        for card in collection["cards"]:
            original, thumb = image_paths(collection, card)
            targets[card["image"]] = (IMAGES / original, IMAGES / thumb)
    if not set(targets).issubset(inventory):
        raise ValueError("Source Git inventory does not contain all catalog card faces")
    results, actual, pending = {}, {}, {}
    extra_cache = cache / "chs-extra-images"

    def process(path, data):
        expected = inventory[path]
        sha = blob_hash(data)
        if len(data) != expected["size"] or sha != expected["sha"]:
            raise ValueError(f"Source Git blob/size verification failed: {path}")
        if path in targets:
            original, thumb = targets[path]
            proof = save_image(data, original, thumb)
        else:
            destination = extra_cache / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists() and destination.read_bytes() != data:
                raise ValueError(f"Existing extra source asset differs: {destination}")
            destination.write_bytes(data)
            proof = None
        return path, sha, proof

    def fetch(path):
        existing = targets[path][0] if path in targets else extra_cache / path
        if existing.exists():
            data = existing.read_bytes()
        else:
            with urllib.request.urlopen(RAW + path, timeout=45) as response:
                data = response.read(32 * 1024**2 + 1)
        return process(path, data)

    def reap(done):
        for future in done:
            pending.pop(future)
            path, sha, proof = future.result()
            actual[path] = sha
            if proof:
                results[path] = proof
        if len(results) % 1000 < len(done):
            print(f"Verified and prepared {len(results)}/{len(targets)} card faces", flush=True)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for path, data in partial_entries(cache / "ptcg-chs-datasets.zip.part"):
            if path not in inventory:
                raise ValueError(f"Partial archive contains an unexpected source image: {path}")
            pending[pool.submit(process, path, data)] = path
            if len(pending) >= workers * 3:
                done, _ = wait(pending, return_when=FIRST_COMPLETED)
                reap(done)
        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)
            reap(done)
        missing = sorted(set(inventory) - set(actual))
        print(f"Recovered {len(actual)} verified source files; fetching {len(missing)} missing files", flush=True)
        for path in missing:
            pending[pool.submit(fetch, path)] = path
            if len(pending) >= workers * 3:
                done, _ = wait(pending, return_when=FIRST_COMPLETED)
                reap(done)
        while pending:
            done, _ = wait(pending, return_when=FIRST_COMPLETED)
            reap(done)
    actual_tree = git_tree_hash({path[len('img/'):]: sha for path, sha in actual.items()})
    if actual_tree != IMAGE_GIT_TREE or set(results) != set(targets):
        raise ValueError("Final recovered image collection does not match the pinned source")
    write_json(DATA / "image-manifest.json", {
        "source_commit": COMMIT, "source_image_git_tree": actual_tree,
        "verified_image_tree": True, "images": dict(sorted(results.items())),
        "missing_source_paths": [], "non_card_source_paths": sorted(set(inventory) - set(targets)),
    })
