#!/usr/bin/env python3
"""Extract complete JS, Python, metadata and settings messages reproducibly."""

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UUID = "z-usage@oss-singularity"
POT = ROOT / "po" / f"{UUID}.pot"


def settings_messages(value):
    if not isinstance(value, dict):
        return
    for key, child in value.items():
        if key in {"title", "description", "tooltip", "units"} and isinstance(child, str):
            yield child
        elif key == "options" and isinstance(child, dict):
            yield from child
        elif isinstance(child, dict):
            yield from settings_messages(child)


def extract():
    with tempfile.TemporaryDirectory(prefix="usage-gettext-") as directory:
        work = Path(directory)
        for name in ["applet.js", "usage-format.js", "z_usage.py"]:
            (work / name).write_bytes((ROOT / name).read_bytes())
        for name in ["settings-schema", "metadata"]:
            data = json.loads((ROOT / f"{name}.json").read_text())
            messages = (
                settings_messages(data) if name == "settings-schema" else (data[key] for key in ["name", "description"])
            )
            (work / f"{name}.json.js").write_text(
                "\n".join(f"_({json.dumps(text, ensure_ascii=False)});" for text in messages) + "\n"
            )
        common = [
            "xgettext",
            "--from-code=UTF-8",
            "--keyword=_",
            "--keyword=_f:1",
            "--add-location=file",
            "--sort-output",
            "--no-wrap",
            "--package-name=Z Usage Monitor",
            f"--package-version={json.loads((ROOT / 'metadata.json').read_text())['version']}",
            "--msgid-bugs-address=https://github.com/oss-singularity/cinnamon-z-usage/issues",
            "--copyright-holder=OSS Singularity",
            "--output=messages.pot",
        ]
        subprocess.run(
            common
            + [
                "--language=JavaScript",
                "--flag=_f:1:javascript-format",
                "applet.js",
                "usage-format.js",
                "settings-schema.json.js",
                "metadata.json.js",
            ],
            cwd=work,
            check=True,
        )
        subprocess.run(
            common + ["--join-existing", "--language=Python", "z_usage.py"],
            cwd=work,
            check=True,
        )
        result = (work / "messages.pot").read_text()
        result = re.sub(r'"POT-Creation-Date: .*?\\n"', '"POT-Creation-Date: 2026-09-08 00:00+0000\\\\n"', result)
        result = result.replace("SOME DESCRIPTIVE TITLE.", "Z Usage Monitor translation template.")
        result = result.replace("YEAR OSS Singularity", "2026 OSS Singularity")
        result = result.replace(
            "This file is distributed under the same license as the Z Usage Monitor package.",
            "This file is distributed under the GPL-3.0-or-later license.",
        )
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = extract()
    if args.check:
        if not POT.is_file() or POT.read_text() != result:
            raise SystemExit("Translation template is stale; run make translations")
        print("Translation template: JS, Python, metadata and settings extraction is current.")
    else:
        POT.parent.mkdir(exist_ok=True)
        POT.write_text(result)


if __name__ == "__main__":
    main()
