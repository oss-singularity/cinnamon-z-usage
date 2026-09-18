#!/usr/bin/env python3
"""Verify that a release checkout is the exact clean default-branch commit."""

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def git(*arguments):
    result = subprocess.run(
        ["git", *arguments],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown git error"
        raise RuntimeError(f"git {' '.join(arguments)} failed: {detail}")
    return result.stdout.strip()


def fail(message):
    print(f"RELEASE_BASE_FAILED: {message}", file=sys.stderr)
    return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True, help="Version from metadata.json, for example 1.0.4")
    parser.add_argument(
        "--main-ref",
        default="refs/remotes/origin/main",
        help="Fetched default-branch ref to compare against",
    )
    parser.add_argument("--head", default="HEAD", help="Checkout or ref to verify")
    parser.add_argument("--tag", help="Optional tag that must peel to the same commit")
    args = parser.parse_args()

    try:
        metadata = json.loads((ROOT / "metadata.json").read_text())
    except (OSError, json.JSONDecodeError) as error:
        return fail(f"cannot read metadata.json: {error}")
    if metadata.get("version") != args.version:
        return fail(f"metadata.json declares {metadata.get('version')!r}, expected {args.version!r}")

    try:
        status = git("status", "--porcelain")
        if status:
            return fail("checkout is not clean; commit or remove every change before tagging")
        main_sha = git("rev-parse", "--verify", f"{args.main_ref}^{{commit}}")
        head_sha = git("rev-parse", "--verify", f"{args.head}^{{commit}}")
    except RuntimeError as error:
        return fail(f"{error}; fetch the default branch and tags before retrying")

    if head_sha != main_sha:
        return fail(
            f"HEAD {head_sha} is not the exact {args.main_ref} commit {main_sha}; "
            "merge the source PR into main before creating a release tag"
        )

    tag_sha = None
    if args.tag:
        if args.tag != f"v{args.version}":
            return fail(f"tag {args.tag!r} does not match version {args.version!r}")
        try:
            tag_sha = git("rev-parse", "--verify", f"refs/tags/{args.tag}^{{commit}}")
        except RuntimeError as error:
            return fail(f"cannot resolve {args.tag}: {error}")
        if tag_sha != main_sha:
            return fail(f"tag {args.tag} peels to {tag_sha}, not the exact main commit {main_sha}")

    suffix = f" tag={args.tag} tag_sha={tag_sha}" if args.tag else ""
    print(f"RELEASE_BASE_OK version={args.version} main_sha={main_sha} head_sha={head_sha}{suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
