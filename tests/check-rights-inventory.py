#!/usr/bin/env python3
"""Verify asset evidence coverage; this does not determine legal permission."""

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {
    ".png",
    ".svg",
    ".jpg",
    ".jpeg",
    ".webp",
    ".ttf",
    ".woff",
    ".woff2",
    ".ico",
}
RETIRED_HASHES = {
    "e91af8777ed207355f280c308a5d23f07cb4120bf32c006ed7849b2966865347",
    "a859b63a9a3009f0d806239f5912e4d02537869f460843a5f8e7600316b264dc",
    "be9b4e352180b9eca4f08385b969d61cda9321c49390a7169fdc01bd8a599bba",
}

paths = (
    subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    )
    .decode()
    .split("\0")
)
assets = {name for name in paths if Path(name).suffix.lower() in EXTENSIONS and (ROOT / name).is_file()}
inventory = json.loads((ROOT / "docs/rights-inventory.json").read_text())["assets"]
if assets != set(inventory):
    raise SystemExit(f"Rights inventory coverage mismatch: {sorted(assets.symmetric_difference(inventory))}")
for name in sorted(assets):
    digest = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
    if digest in RETIRED_HASHES:
        raise SystemExit(f"Retired third-party artwork reintroduced: {name}")
    record = inventory[name]
    if record["sha256"] != digest:
        raise SystemExit(f"Rights inventory predates asset change: {name}")
    if record.get("license") not in {
        "GPL-3.0-or-later",
        "CC-BY-SA-4.0",
    } or not record.get("evidence"):
        raise SystemExit(f"Missing declared license/evidence: {name}")
print(f"Rights inventory: {len(assets)} assets covered; retired image hashes absent. Not a legal clearance.")
