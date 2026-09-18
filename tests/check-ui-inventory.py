#!/usr/bin/env python3
"""Check screenshot coverage and the producing runtime/schema source hashes."""

import hashlib
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "docs/model-limits"
spec = importlib.util.spec_from_file_location("capture", ROOT / "tests/ui/capture.py")
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)
manifest = json.loads((DIRECTORY / "inventory.json").read_text())
referenced = set(re.findall(r"docs/model-limits/([a-z0-9-]+\.png)", (ROOT / "README.md").read_text()))
if referenced != set(manifest):
    raise SystemExit(f"Screenshot inventory mismatch: {referenced.symmetric_difference(manifest)}")
for name, record in manifest.items():
    try:
        capture.verify_composition(
            record["actorGeometry"],
            record["panelGeometry"],
            record["cropGeometry"],
            [int(value) for value in record["screen"].split("x")[:2]],
            record["variant"],
        )
        if (
            record["variant"] in {"reset", "install-chatgpt", "install-codex"}
            and min(record["backgroundCornerRgb"]) < 60
        ):
            raise ValueError("Modal backdrop is too dark")
        if "tests/assets/cinnamon-teal-background.svg" not in record["sourceSha256"]:
            raise ValueError("Missing desktop background provenance")
        if record["extension"] != "transparent-panels@germanfr" or not 0 <= record["panelBackgroundAlpha"] < 255:
            raise ValueError("Native panel must use the reference transparency")
        if not re.fullmatch(r"[0-9a-f]{64}", record["extensionConfigSha256"]):
            raise ValueError("Missing panel transparency settings provenance")
    except (KeyError, ValueError) as error:
        raise SystemExit(f"Screenshot composition is not verified: {name}: {error}") from error
    if name.startswith("usage-menu") or name == "bucket-tooltip.png":
        if record.get("surface") != "popup" or record.get("actorGeometry", [0, 0, 0])[2] != 419:
            raise SystemExit(f"Screenshot has no verified 420 px popup width (419 px actor + edge): {name}")
    if hashlib.sha256((DIRECTORY / name).read_bytes()).hexdigest() != record["sha256"]:
        raise SystemExit(f"Screenshot changed without a reviewed inventory: {name}")
    if record.get("sourcePolicy") == "historical":
        if name not in {"topbar.png", "vertical-panel.png"}:
            raise SystemExit(f"Historical source policy is limited to panel anchors: {name}")
        if not re.fullmatch(r"\d+\.\d+\.\d+", str(record.get("sourceRelease", ""))):
            raise SystemExit(f"Historical screenshot is missing its source release: {name}")
        continue
    for source, digest in record["sourceSha256"].items():
        # Descriptive documentation does not affect native rendering. Its old
        # hash remains useful provenance, but need not force new screenshots.
        if source.endswith(".md"):
            continue
        if hashlib.sha256((ROOT / source).read_bytes()).hexdigest() != digest:
            raise SystemExit(f"Screenshot {name} predates source change: {source}")
print(f"UI inventory: {len(manifest)} images match their producing source and output hashes.")
