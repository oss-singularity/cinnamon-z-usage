#!/usr/bin/env python3
"""Render the project's original SVG sources, or verify committed PNGs."""

import argparse
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {
    "icon.png": "icons/applet.svg",
    "icons/usage-white.png": "icons/usage.svg",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="usage-icons-") as temporary:
        for output, source in SOURCES.items():
            rendered = Path(temporary) / Path(output).name
            subprocess.run(
                ["rsvg-convert", "-o", str(rendered), str(ROOT / source)], check=True
            )
            if args.check:
                if rendered.read_bytes() != (ROOT / output).read_bytes():
                    raise SystemExit(f"Icon differs from its SVG source: {output}")
            else:
                (ROOT / output).write_bytes(rendered.read_bytes())
    print(
        f"Original icons: {len(SOURCES)} PNGs {'verified' if args.check else 'rendered'}."
    )


if __name__ == "__main__":
    main()
