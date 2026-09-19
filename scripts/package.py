#!/usr/bin/env python3
"""Allowlisted user installation and deterministic Cinnamon Spices export."""

import argparse
import hashlib
import json
import os
import stat
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UUID = "z-usage@oss-singularity"
UPSTREAM = "0fa36ed070daa26d51ced6ea87a08066b342eca4"
VALIDATOR_SHA256 = "3b74a9b8360314ebb42ece78fe3215513144f8b64078e327ca0c03c9d8b63928"
RETIRED_ARTWORK = {
    "icons/codex.png": "e91af8777ed207355f280c308a5d23f07cb4120bf32c006ed7849b2966865347",
    "icons/chatgpt-white.png": "a859b63a9a3009f0d806239f5912e4d02537869f460843a5f8e7600316b264dc",
}


def payload():
    manifest = json.loads((ROOT / "packaging/files.json").read_text())
    files = {}
    for destination, source in manifest.items():
        for name in (destination, source):
            if Path(name).is_absolute() or ".." in Path(name).parts:
                raise ValueError(f"Unsafe package path: {name}")
        path = ROOT / source
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Package source must be a regular file: {source}")
        files[destination] = path.read_bytes()
    metadata = json.loads(files["metadata.json"])
    if metadata["uuid"] != UUID:
        raise ValueError("Package UUID does not match metadata")
    return files


def install(data_root):
    target = Path(data_root) / "cinnamon/applets" / UUID
    files = payload()
    # Validate every destination before changing any installed file. Extra user
    # files remain untouched; the manifest is the complete managed payload.
    for relative in files:
        destination = target / relative
        for path in (destination, *destination.parents):
            if path.is_symlink():
                raise ValueError(f"Refusing symlink installation target: {path}")
    for relative, content in files.items():
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=".install-", dir=destination.parent)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(content)
                os.fchmod(stream.fileno(), 0o644)
            os.replace(temporary, destination)
        finally:
            Path(temporary).unlink(missing_ok=True)
    # Remove only byte-identical files shipped by our older releases. Preserve
    # user replacements and symlinks; never treat an arbitrary extra as owned.
    for relative, digest in RETIRED_ARTWORK.items():
        retired = target / relative
        if not retired.is_symlink() and retired.is_file():
            if hashlib.sha256(retired.read_bytes()).hexdigest() == digest:
                retired.unlink()
    return target


def export(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("Export destination must be empty")
    files = {f"{UUID}/files/{UUID}/{name}": data for name, data in payload().items()}
    files.update(
        {
            f"{UUID}/{name}": (ROOT / source).read_bytes()
            for name, source in {
                "info.json": "packaging/info.json",
                "README.md": "packaging/README.md",
                "screenshot.png": "docs/model-limits/usage-menu.png",
            }.items()
        }
    )
    for name, content in sorted(files.items()):
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        target.chmod(0o644)
    # Store-download layout is files/UUID, whereas the submission includes info
    # and screenshot at the outer level. Produce both, without timestamps/owners.
    for archive, prefix in [("submission.zip", ""), ("install.zip", f"{UUID}/files/")]:
        with zipfile.ZipFile(output / archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
            for name, content in sorted(files.items()):
                if prefix and not name.startswith(prefix):
                    continue
                info = zipfile.ZipInfo(name[len(prefix) :], date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                bundle.writestr(info, content)
    hashes = {name: hashlib.sha256(content).hexdigest() for name, content in sorted(files.items())}
    for name in ["submission.zip", "install.zip"]:
        hashes[name] = hashlib.sha256((output / name).read_bytes()).hexdigest()
    (output / "SHA256SUMS").write_text("".join(f"{digest}  {name}\n" for name, digest in hashes.items()))
    return output


def validate(output):
    url = f"https://raw.githubusercontent.com/linuxmint/cinnamon-spices-applets/{UPSTREAM}/validate-spice"
    with urllib.request.urlopen(url, timeout=20) as response:
        source = response.read()
    if hashlib.sha256(source).hexdigest() != VALIDATOR_SHA256:
        raise ValueError("Pinned upstream validator hash mismatch")
    with tempfile.TemporaryDirectory(prefix="spices-validator-") as directory:
        validator = Path(directory) / "validate-spice"
        validator.write_bytes(source)
        subprocess.run(["python3", str(validator), UUID], cwd=output, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    user_install = commands.add_parser("install")
    user_install.add_argument("--data-root", required=True)
    package = commands.add_parser("export")
    package.add_argument("--output", type=Path, required=True)
    package.add_argument("--validate", action="store_true")
    args = parser.parse_args()
    if args.command == "install":
        print(f"Z Usage Monitor installed: {install(args.data_root)}")
    else:
        output = export(args.output)
        if args.validate:
            validate(output)
        print(f"Local Spices review package: {output}")


if __name__ == "__main__":
    main()
