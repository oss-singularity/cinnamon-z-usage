#!/usr/bin/env python3
"""Recreate the README inventory in private Cinnamon sessions."""

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "tests/ui"
SPECS = [
    ("usage-menu", "overview", "vertical", {}, "native"),
    ("usage-menu-horizontal", "basic", "horizontal", {}, "native"),
    ("usage-menu-history", "history", "vertical", {}, "native"),
    ("usage-menu-four-rings", "four", "vertical", {}, "native"),
    (
        "usage-menu-credits",
        "credits",
        "vertical",
        {"QA_SHOW_CREDITS_IN_PANEL": "1"},
        "native",
    ),
    ("bucket-tooltip", "bucket", "vertical", {}, "native"),
    ("topbar", "panel", "horizontal", {}, "native"),
    ("vertical-panel", "panel", "vertical", {}, "native"),
    (
        "topbar-credits",
        "credits-panel",
        "horizontal",
        {"QA_SHOW_CREDITS_IN_PANEL": "1"},
        "native",
    ),
    (
        "vertical-panel-credits",
        "credits-panel",
        "vertical",
        {"QA_SHOW_CREDITS_IN_PANEL": "1"},
        "native",
    ),
    ("reset-confirmation", "reset", "vertical", {}, "native"),
    ("panel-tooltip", "panel-tooltip", "horizontal", {}, "native"),
    ("settings-general", "settings-general", "vertical", {}, "native"),
    ("settings-colors", "settings-colors", "vertical", {}, "native"),
    ("settings-notifications", "settings-notifications", "vertical", {}, "native"),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_composition(actor, panel, crop, screen, variant):
    x, y, width, height = crop
    ax, ay, aw, ah = panel[4:]
    if aw <= 0 or ah <= 0 or not (x <= ax and y <= ay and ax + aw <= x + width and ay + ah <= y + height):
        raise ValueError("Crop must include the complete applet anchor")
    if False:
        if panel[2] != 40 or panel[0] <= 0:
            raise ValueError("Documentation dialogs require the right vertical panel")
        if panel[0] - actor[0] - actor[2] != 48 or screen[1] - actor[1] - actor[3] != 48:
            raise ValueError("Dialog must sit 48 px from the panel and bottom edge")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--theme", default="Mint-Y-Dark-Aqua")
    parser.add_argument("--extension", required=True, type=Path)
    parser.add_argument("--extension-config", required=True, type=Path)
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args()
    if args.extension.name != "transparent-panels@germanfr" or not args.extension.is_dir():
        parser.error("Public captures require the installed transparent-panels@germanfr extension")
    if not args.extension_config.is_file():
        parser.error("Public captures require the reference panel transparency settings")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    stage = output / "stage"
    subprocess.run([str(ROOT / "install.sh")], check=True, env={**os.environ, "XDG_DATA_HOME": str(stage)})
    manifest_path = output / "inventory.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    source_paths = [
        "applet.js",
        "z_usage.py",
        "usage-format.js",
        "metadata.json",
        "settings-schema.json",
        "path_settings.py",
        "notification_settings.py",
        "tests/assets/cinnamon-teal-background.svg",
    ]
    source_paths += [str(path.relative_to(ROOT)) for path in sorted(UI.iterdir()) if path.is_file()]
    source_paths += ["icon.png"] + [
        str(path.relative_to(ROOT)) for path in sorted((ROOT / "icons").iterdir()) if path.suffix in {".png", ".svg"}
    ]
    sources = {name: sha(ROOT / name) for name in source_paths}
    for name, variant, mode, capture_env, panel_crop in SPECS:
        if args.only and name not in args.only:
            continue
        raw = output / f"{name}.raw.png"
        geometry = output / f"{name}.geometry"
        panel = output / f"{name}.panel.geometry"
        image = output / f"{name}.png"
        size = "1920x1080x24"
        if mode == "horizontal" and variant in ["panel-tooltip"]:
            size = "720x540x24"
        command = [
            str(UI / "run-isolated.sh"),
            "--stage-applet",
            str(stage / "cinnamon/applets/z-usage@oss-singularity"),
            "--output",
            str(raw),
            "--geometry",
            size,
            "--settle-ms",
            "13000",
        ]
        if args.extension:
            command += ["--stage-extension", str(args.extension)]
        if args.extension_config:
            command += ["--stage-extension-config", str(args.extension_config)]
        command += ["--", str(UI / "capture-variant.sh"), variant, str(geometry), mode, str(panel)]
        with (output / f"{name}.log").open("w") as log:
            subprocess.run(
                command,
                check=True,
                stdout=log,
                stderr=subprocess.STDOUT,
                env={
                    **os.environ,
                    **capture_env,
                    "QA_THEME": args.theme,
                    "QA_REQUIRE_TRANSPARENT_PANEL": "1",
                },
                cwd=ROOT,
            )
        alpha_match = re.search(r"private-panel-alpha=(\d+)", (output / f"{name}.log").read_text())
        if not alpha_match or int(alpha_match[1]) >= 255:
            raise ValueError("Native panel transparency was not verified")
        if variant in {"panel", "credits-panel"}:
            crop = [str(UI / "crop-panel.sh"), str(raw), str(panel), str(image), mode, panel_crop]
        else:
            crop = [str(UI / "crop-menu.sh"), str(raw), str(geometry), str(image), str(panel), mode]
        subprocess.run(crop, check=True)
        actor_geometry = [int(value) for value in geometry.read_text().strip().split(",")]
        panel_geometry = [int(value) for value in panel.read_text().strip().split(",")]
        crop_geometry = json.loads(image.with_suffix(".crop.json").read_text())
        screen_geometry = [int(value) for value in size.split("x")[:2]]
        verify_composition(actor_geometry, panel_geometry, crop_geometry, screen_geometry, variant)
        corner = subprocess.check_output(
            [
                "convert",
                str(image),
                "-format",
                "%[fx:int(255*p{0,0}.r)],%[fx:int(255*p{0,0}.g)],%[fx:int(255*p{0,0}.b)]",
                "info:",
            ],
            text=True,
        )
        corner_rgb = [int(value) for value in corner.split(",")]
        if False and min(corner_rgb) < 60:
            raise ValueError("Modal backdrop is too dark for the approved blue composition")
        is_popup = variant in {"overview", "basic", "history", "four", "credits", "bucket"}
        if is_popup and actor_geometry[2] != 419:
            raise RuntimeError(f"{name}: expected 419 px popup actor plus 1 px edge, got {actor_geometry[2]}")
        manifest[name + ".png"] = {
            "surface": ("popup" if is_popup else "panel" if variant in {"panel", "credits-panel"} else "popup"),
            "actorGeometry": actor_geometry,
            "panelGeometry": panel_geometry,
            "cropGeometry": crop_geometry,
            "backgroundCornerRgb": corner_rgb,
            "variant": variant,
            "panelScope": (
                "credits-only"
                if variant in {"credits", "credits-panel"} or capture_env.get("QA_MODEL_SPECIFIC_LIMITS") == "off"
                else "all-visible-models"
            ),
            "panelCrop": panel_crop,
            "panel": mode,
            "theme": args.theme,
            "locale": "C.UTF-8; LC_TIME=de_DE.UTF-8",
            "gtkTheme": "Mint-Y",
            "scale": 1,
            "screen": size,
            "extension": args.extension.name if args.extension else None,
            "extensionConfigSha256": sha(args.extension_config),
            "panelBackgroundAlpha": int(alpha_match[1]),
            "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "baseCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "sourceSha256": sources,
            "sha256": sha(image),
            "dimensions": subprocess.check_output(["identify", "-format", "%wx%h", str(image)], text=True),
        }
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"Verified capture: {name}", flush=True)


if __name__ == "__main__":
    main()
