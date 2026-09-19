"""A fresh desktop-profile history cannot inherit a previous account's samples."""

import json
import tempfile
import unittest
from pathlib import Path

from z_usage import update_usage_history


class HistoryBoundaryTests(unittest.TestCase):
    def test_manual_archive_starts_fresh_without_deleting_reset_journal(self):
        def snapshot(now, used):
            return {
                "updatedAt": now,
                "limits": [
                    {
                        "id": "zai",
                        "label": "Z.ai",
                        "windows": [
                            {
                                "durationMinutes": 300,
                                "usedPercent": used,
                                "remainingPercent": 100 - used,
                                "resetsAt": 20000,
                            }
                        ],
                    }
                ],
            }

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            history = root / "history.json"
            journal = root / "reset-attempt.json"
            journal.write_text("unresolved reset fixture")
            update_usage_history(snapshot(10000, 20), history)
            archive = root / "previous-profile.json"
            history.rename(archive)
            archived = archive.read_bytes()
            current = update_usage_history(snapshot(11000, 70), history)
            samples = json.loads(history.read_text())["samples"]
            self.assertEqual(len(samples), 1)
            self.assertEqual(samples[0]["timestamp"], 11000)
            self.assertEqual(archive.read_bytes(), archived)
            self.assertEqual(journal.read_text(), "unresolved reset fixture")
            self.assertEqual(current["history"]["windows"][0]["periods"]["1h"]["consumedPercent"], 0)
            self.assertFalse(current["history"]["windows"][0]["periods"]["1h"]["complete"])
