#!/usr/bin/env python3
"""Render a deterministic Z Usage Monitor social-preview variant."""

from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

WIDTH = 1280
HEIGHT = 640


def parse_args(variants: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variant", choices=variants, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def image_magick() -> list[str]:
    executable = shutil.which("magick") or shutil.which("convert")
    if not executable:
        raise SystemExit("ImageMagick is required (magick or convert).")
    return [executable]


def rsvg_convert() -> str:
    executable = shutil.which("rsvg-convert")
    if not executable:
        raise SystemExit("librsvg2-bin is required (rsvg-convert).")
    return executable


def main() -> int:
    source_dir = Path(__file__).resolve().parent
    repo_dir = source_dir.parents[1]
    variants = json.loads((source_dir / "variants.json").read_text(encoding="utf-8"))
    args = parse_args(sorted(variants))
    variant = variants[args.variant]

    background = source_dir / "background.png"
    icon = repo_dir / "icons/usage-white.png"
    if not background.is_file() or not icon.is_file():
        raise SystemExit("Social-preview background or usage icon is missing.")

    replacements = {
        "{{TAGLINE}}": html.escape(str(variant["tagline"])),
    }
    overlay_text = (source_dir / "overlay.svg").read_text(encoding="utf-8")
    for marker, value in replacements.items():
        overlay_text = overlay_text.replace(marker, value)

    command = image_magick()
    svg_renderer = rsvg_convert()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="chatgpt-usage-social-preview-") as temporary:
        work_dir = Path(temporary)
        overlay_svg = work_dir / "overlay.svg"
        overlay_png = work_dir / "overlay.png"
        canvas = work_dir / "background.png"
        app_icon = work_dir / "icon.png"
        overlay_svg.write_text(overlay_text, encoding="utf-8")

        subprocess.run(
            [svg_renderer, "--output", str(overlay_png), str(overlay_svg)],
            check=True,
        )
        subprocess.run(
            command + [str(background), "-resize", f"{WIDTH}x{HEIGHT}!", str(canvas)],
            check=True,
        )
        subprocess.run(
            command + [str(icon), "-filter", "Lanczos", "-resize", "82x82", str(app_icon)],
            check=True,
        )
        subprocess.run(
            command
            + [
                str(canvas),
                str(overlay_png),
                "-composite",
                str(app_icon),
                "-geometry",
                "+91+171",
                "-composite",
                "-colorspace",
                "sRGB",
                "-alpha",
                "off",
                "-strip",
                str(output),
            ],
            check=True,
        )

    print(f"Rendered {args.variant}: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
