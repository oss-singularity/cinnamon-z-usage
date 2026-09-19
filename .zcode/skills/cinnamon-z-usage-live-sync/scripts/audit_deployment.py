#!/usr/bin/env python3
"""Audit the copy-based live deployment of cinnamon-chatgpt-usage."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


DEFAULT_PROJECT = Path("/home/claudiu/git/oss-singularity/cinnamon-chatgpt-usage")
DEFAULT_INSTALLED = Path("/home/claudiu/.local/share/cinnamon/applets/chatgpt-usage@oss-singularity")


def load_manifest(project: Path, manifest_path: Path | None) -> tuple[tuple[str, str], ...]:
    path = manifest_path or project / "packaging/files.json"
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict) or not payload:
        raise ValueError("packaging/files.json must contain a non-empty object")

    entries: list[tuple[str, str]] = []
    for destination, source in payload.items():
        if not isinstance(destination, str) or not isinstance(source, str):
            raise ValueError("manifest paths must be strings")
        destination_path = Path(destination)
        source_path = Path(source)
        if (
            destination_path.is_absolute()
            or source_path.is_absolute()
            or ".." in destination_path.parts
            or ".." in source_path.parts
        ):
            raise ValueError(f"unsafe manifest path: {destination} -> {source}")
        entries.append((destination, source))
    return tuple(entries)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=DEFAULT_PROJECT)
    parser.add_argument("--installed", type=Path, default=DEFAULT_INSTALLED)
    parser.add_argument(
        "--manifest",
        type=Path,
        help="manifest path; defaults to <project>/packaging/files.json",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        managed_files = load_manifest(args.project, args.manifest)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"FAIL manifest: {error}")
        return 1

    valid = 0
    symlinks = 0
    mismatches = 0

    for destination, source_relative in managed_files:
        source = args.project / source_relative
        target = args.installed / destination
        problems: list[str] = []

        if not source.is_file():
            problems.append("source missing")

        symlink_parent = next(
            (parent for parent in target.parents if parent != args.installed and parent.is_symlink()),
            None,
        )
        if symlink_parent is not None:
            symlinks += 1
            problems.append(f"installed parent is a symlink: {symlink_parent}")
        if target.is_symlink():
            symlinks += 1
            problems.append("installed target is a symlink")
        elif not target.is_file():
            problems.append("installed target missing")

        if not problems and sha256(source) != sha256(target):
            problems.append("hash mismatch")

        if problems:
            mismatches += 1
            print(f"FAIL {destination}: {', '.join(problems)}")
        else:
            valid += 1
            print(f"OK   {destination}")

    print(f"EXPECTED={len(managed_files)} VALID={valid} SYMLINKS={symlinks} MISMATCHES={mismatches}")
    return 0 if valid == len(managed_files) else 1


if __name__ == "__main__":
    raise SystemExit(main())
