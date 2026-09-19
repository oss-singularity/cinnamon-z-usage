"""Installer and exported archive use the same private-data-free payload."""

import hashlib
import importlib.util
import json
import os
import subprocess
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("package", Path(__file__).resolve().parents[1] / "scripts/package.py")
package = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(package)


class PackageTests(unittest.TestCase):
    def test_deterministic_export_and_install_archive(self):
        with TemporaryDirectory() as directory:
            first = package.export(Path(directory) / "first")
            second = package.export(Path(directory) / "second")
            for name in ["submission.zip", "install.zip", "SHA256SUMS"]:
                self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())
            with zipfile.ZipFile(first / "install.zip") as archive:
                files = package.payload()
                self.assertEqual(
                    set(archive.namelist()),
                    {f"{package.UUID}/{name}" for name in files},
                )
                extracted = Path(directory) / "extract"
                archive.extractall(extracted)
                for name, content in files.items():
                    self.assertEqual((extracted / package.UUID / name).read_bytes(), content)
            with self.assertRaises(ValueError):
                package.export(first)

    def test_install_upgrade_and_uninstall_retain_external_state(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data with spaces"
            state = root / "state"
            state.mkdir()
            history = state / "history.json"
            history.write_text("private fixture")
            target = package.install(data)
            files = package.payload()
            for name, content in files.items():
                self.assertEqual((target / name).read_bytes(), content)
                self.assertFalse((target / name).is_symlink())
            (target / "applet.js").write_text("older payload")
            (target / "unmanaged.txt").write_text("leave in place on upgrade")
            package.install(data)
            self.assertEqual((target / "applet.js").read_bytes(), files["applet.js"])
            self.assertTrue((target / "unmanaged.txt").exists())
            subprocess.run(
                [str(package.ROOT / "uninstall.sh")],
                env={
                    **os.environ,
                    "XDG_DATA_HOME": str(data),
                    "XDG_STATE_HOME": str(state),
                },
                check=True,
                stdout=subprocess.DEVNULL,
            )
            self.assertFalse(target.exists())
            self.assertEqual(history.read_text(), "private fixture")

    def test_symlink_destination_refused_before_mutation(self):
        with TemporaryDirectory() as directory:
            target = package.install(directory)
            victim = Path(directory) / "outside"
            victim.write_text("untouched")
            (target / "applet.js").unlink()
            (target / "applet.js").symlink_to(victim)
            with self.assertRaises(ValueError):
                package.install(directory)
            self.assertEqual(victim.read_text(), "untouched")

    def test_metadata_and_notices(self):
        files = package.payload()
        compile(files["notification_settings.py"], "notification_settings.py", "exec")
        metadata = json.loads(files["metadata.json"])
        self.assertTrue(json.dumps(metadata, ensure_ascii=False).isascii())
        self.assertFalse({"icon", "dangerous", "last-edited"}.intersection(metadata))
        for name in [
            "ATTRIBUTION.md",
            "SECURITY.md",
            "icons/ATTRIBUTION.md",
            "icons/LICENSE-CC-BY-SA-4.0.txt",
        ]:
            self.assertIn(name, files)

    def test_original_artwork_sources_and_no_retired_assets(self):
        files = package.payload()
        self.assertFalse({"icons/codex.png", "icons/chatgpt-white.png"}.intersection(files))
        for name in ["applet", "usage", "zai-chat", "zcode"]:
            self.assertIn(f"icons/{name}.svg", files)
            self.assertIn(b"SPDX-License-Identifier: GPL-3.0-or-later", files[f"icons/{name}.svg"])
        self.assertNotIn("icons/terminal-bot.svg", files)
        self.assertNotIn("icons/terminal-bot.png", files)
        self.assertNotIn("icons/chat-bubble.svg", files)
        self.assertIn("icons/usage-white.png", files)
        self.assertIn(b'fileName: "zai-chat.svg"', files["applet.js"])
        self.assertNotIn(b'fileName: "terminal-bot.png"', files["applet.js"])

    def test_upgrade_removes_only_known_retired_artwork(self):
        with TemporaryDirectory() as directory:
            target = package.install(directory)
            retired = target / "icons/codex.png"
            expected = b"old artwork fixture"
            digest = hashlib.sha256(expected).hexdigest()
            with patch.dict(package.RETIRED_ARTWORK, {"icons/codex.png": digest}, clear=True):
                retired.write_bytes(expected)
                package.install(directory)
                self.assertFalse(retired.exists())
                retired.write_bytes(b"user replacement")
                package.install(directory)
                self.assertEqual(retired.read_bytes(), b"user replacement")
                retired.unlink()
                outside = Path(directory) / "outside-artwork"
                outside.write_bytes(expected)
                retired.symlink_to(outside)
                package.install(directory)
                self.assertTrue(retired.is_symlink())
                self.assertEqual(outside.read_bytes(), expected)
