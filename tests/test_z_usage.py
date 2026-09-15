#!/usr/bin/env python3
"""Tests for the Z.ai coding plan usage snapshot."""

from __future__ import annotations

import datetime as dt
import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from z_usage import (
    ACCOUNT_LIMIT_ID,
    build_usage_history,
    config_key_path,
    is_authentication_error,
    normalise_quota_limits,
    resolve_api_key,
    update_usage_history,
    zcode_provider_key,
)
from z_usage import AuthenticationRequired, UsageError


def quota_entry(**overrides):
    entry = {
        "type": "CREDIT_LIMIT",
        "unit": 3,
        "number": 5,
        "usage": 28000,
        "currentValue": 2073,
        "remaining": 25927,
        "percentage": 7,
        "nextResetTime": 1789479939769,
    }
    entry.update(overrides)
    return entry


class NormaliseQuotaLimitsTests(unittest.TestCase):
    def test_live_shaped_payload_becomes_one_account_limit(self) -> None:
        data = {
            "limits": [
                quota_entry(),
                quota_entry(unit=6, number=1, usage=140000, remaining=137927, percentage=1, nextResetTime=1790064603989),
            ],
            "level": "max",
        }

        snapshot = normalise_quota_limits(data, now=1789474928)
        self.assertEqual(snapshot["updatedAt"], 1789474928)
        self.assertEqual([item["id"] for item in snapshot["limits"]], [ACCOUNT_LIMIT_ID])
        self.assertEqual(snapshot["limits"][0]["label"], "Z.ai Coding Plan")
        self.assertEqual(snapshot["limits"][0]["planType"], "max")
        windows = snapshot["limits"][0]["windows"]
        self.assertEqual([window["durationMinutes"] for window in windows], [300, 10080])
        self.assertEqual([window["remainingPercent"] for window in windows], [93.0, 99.0])
        self.assertEqual(windows[0]["resetsAt"], 1789479939)
        self.assertEqual(windows[1]["resetsAt"], 1790064603)
        self.assertEqual(windows[0]["usedCredits"], 2073)
        self.assertEqual(windows[0]["totalCredits"], 28000)
        self.assertEqual(snapshot["credits"]["plan"], "max")
        self.assertEqual(snapshot["credits"]["balance"], "137927.0")
        self.assertTrue(snapshot["credits"]["hasCredits"])
        self.assertFalse(snapshot["credits"]["showLimitResets"])

    def test_empty_limits_produce_no_limits(self) -> None:
        snapshot = normalise_quota_limits({"limits": [], "level": "max"}, now=1)
        self.assertEqual(snapshot["limits"], [])
        self.assertEqual(snapshot["credits"]["plan"], "max")
        self.assertIsNone(snapshot["credits"]["balance"])
        self.assertFalse(snapshot["credits"]["hasCredits"])

    def test_invalid_payload_is_ignored(self) -> None:
        for data in [None, {}, {"limits": "nope"}, {"limits": [None, 3, "x"]}]:
            with self.subTest(data=data):
                self.assertEqual(normalise_quota_limits(data, now=2)["limits"], [])


class WindowDurationTests(unittest.TestCase):
    def test_known_units_map_to_coding_plan_windows(self) -> None:
        five_hour = normalise_quota_limits({"limits": [quota_entry()]}, now=1789474928)
        weekly = normalise_quota_limits(
            {"limits": [quota_entry(unit=6, number=1)]}, now=1789474928
        )
        self.assertEqual(five_hour["limits"][0]["windows"][0]["durationMinutes"], 300)
        self.assertEqual(weekly["limits"][0]["windows"][0]["durationMinutes"], 10080)

    def test_unknown_unit_snaps_onto_known_windows(self) -> None:
        # Reset roughly five hours away snaps onto the 5h window.
        entry = quota_entry(unit=99, number=1, nextResetTime=(1789474928 + 4 * 3600 + 3000) * 1000)
        snapshot = normalise_quota_limits({"limits": [entry]}, now=1789474928)
        self.assertEqual(snapshot["limits"][0]["windows"][0]["durationMinutes"], 300)

    def test_unknown_unit_without_reset_is_dropped(self) -> None:
        entry = quota_entry(unit=99, number=1, nextResetTime=None)
        snapshot = normalise_quota_limits({"limits": [entry]}, now=1789474928)
        self.assertEqual(snapshot["limits"], [])


class ApiKeyResolutionTests(unittest.TestCase):
    def test_explicit_argument_wins(self) -> None:
        with patch.dict(os.environ, {"ZAI_API_KEY": "env-key"}):
            self.assertEqual(resolve_api_key("explicit-key"), "explicit-key")

    def test_env_and_file_and_zcode_cache_fallback(self) -> None:
        with patch.dict(os.environ, {"ZAI_API_KEY": "env-key"}, clear=False):
            self.assertEqual(resolve_api_key(None), "env-key")

        with TemporaryDirectory() as directory:
            key_file = Path(directory) / "cinnamon-z-usage" / "api-key"
            key_file.parent.mkdir(parents=True)
            key_file.write_text(" file-key \n", encoding="utf-8")
            with patch.dict(os.environ, {"ZAI_API_KEY": "", "XDG_CONFIG_HOME": directory}, clear=False):
                with patch("z_usage.zcode_provider_key", return_value="cache-key"):
                    self.assertEqual(resolve_api_key(None), "file-key")

        with TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"ZAI_API_KEY": "", "XDG_CONFIG_HOME": directory}, clear=False):
                with patch("z_usage.zcode_provider_key", return_value="cache-key"):
                    self.assertEqual(resolve_api_key(None), "cache-key")

    def test_zcode_cache_provides_the_plan_key(self) -> None:
        with TemporaryDirectory() as directory:
            config = Path(directory) / ".zcode" / "v2" / "config.json"
            config.parent.mkdir(parents=True)
            config.write_text(
                json.dumps(
                    {
                        "provider": {
                            "builtin:zai-coding-plan": {"options": {"apiKey": "cached-key"}},
                            "builtin:zai-start-plan": {"options": {"apiKey": "stale-key"}},
                        }
                    }
                ),
                encoding="utf-8",
            )
            with patch("z_usage.Path.home", return_value=Path(directory)):
                self.assertEqual(zcode_provider_key(), "cached-key")

    def test_missing_everywhere_is_empty(self) -> None:
        with TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"ZAI_API_KEY": "", "XDG_CONFIG_HOME": directory}, clear=False):
                with patch("z_usage.Path.home", return_value=Path(directory)):
                    self.assertEqual(resolve_api_key("  "), "")



class AuthenticationErrorTests(unittest.TestCase):
    def test_rejected_tokens_require_a_new_key(self) -> None:
        messages = (
            "token expired or incorrect",
            "Invalid Token",
            "unauthorized",
            "API key not found",
        )
        for message in messages:
            with self.subTest(message=message):
                self.assertTrue(is_authentication_error(message))

    def test_network_and_service_errors_do_not_discard_stale_usage(self) -> None:
        messages = (
            "Could not reach the Z.ai usage API: timeout",
            "service unavailable",
            "Z.ai returned an unreadable usage response",
        )
        for message in messages:
            with self.subTest(message=message):
                self.assertFalse(is_authentication_error(message))


class UsageHistoryTests(unittest.TestCase):
    @staticmethod
    def snapshot(now: int, used: float = 20, resets_at: int = 9999, balance: str = "0") -> dict:
        return {
            "updatedAt": now,
            "limits": [
                {
                    "id": ACCOUNT_LIMIT_ID,
                    "label": "Z.ai Coding Plan",
                    "windows": [
                        {
                            "durationMinutes": 10080,
                            "usedPercent": used,
                            "remainingPercent": 100 - used,
                            "resetsAt": resets_at,
                        }
                    ],
                }
            ],
            "credits": {"balance": balance},
        }

    @staticmethod
    def sample(
        timestamp: int,
        used: float,
        resets_at: int = 9999,
        credit_balance: float | None = None,
    ) -> dict:
        sample = {
            "timestamp": timestamp,
            "windows": {f"{ACCOUNT_LIMIT_ID}:10080": {"usedPercent": used, "resetsAt": resets_at}},
        }
        if credit_balance is not None:
            sample["creditBalance"] = credit_balance
        return sample

    def test_periods_sum_only_positive_observed_consumption(self) -> None:
        now = 1_800_000_000
        samples = [
            self.sample(now - 3700, 10),
            self.sample(now - 3500, 11),
            self.sample(now - 1800, 13),
            self.sample(now, 18),
        ]

        history = build_usage_history(self.snapshot(now, 18), samples)
        self.assertEqual(history["activityBucketMinutes"], 60)
        self.assertEqual(len(history["windows"][0]["activity24h"]), 24)
        one_hour_end = dt.datetime.fromtimestamp(history["activityEndAt"]).astimezone()
        self.assertEqual((one_hour_end.minute, one_hour_end.second), (0, 0))
        two_hour_history = build_usage_history(self.snapshot(now, 18), samples, bucket_minutes=120)
        self.assertEqual(two_hour_history["activityBucketMinutes"], 120)
        self.assertEqual(len(two_hour_history["windows"][0]["activity24h"]), 12)
        two_hour_end = dt.datetime.fromtimestamp(two_hour_history["activityEndAt"]).astimezone()
        self.assertEqual((two_hour_end.hour % 2, two_hour_end.minute), (0, 0))
        periods = history["windows"][0]["periods"]
        self.assertEqual(periods["1h"]["consumedPercent"], 8)
        self.assertTrue(periods["1h"]["complete"])
        self.assertEqual(periods["4h"]["consumedPercent"], 8)
        self.assertFalse(periods["4h"]["complete"])

    def test_reset_counts_only_usage_in_the_new_window(self) -> None:
        now = 1_800_000_000
        samples = [
            self.sample(now - 3700, 90, 100),
            self.sample(now - 1800, 2, 200),
            self.sample(now, 5, 200),
        ]

        periods = build_usage_history(self.snapshot(now, 5, 200), samples)["windows"][0]["periods"]
        self.assertEqual(periods["1h"]["consumedPercent"], 5)

    def test_credit_balance_samples_round_trip_through_history(self) -> None:
        now = 1_800_000_000
        first = self.snapshot(now - 100, 10, balance="12")
        second = self.snapshot(now, 10, balance="8")

        with TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            update_usage_history(first, path)
            update_usage_history(second, path)
            payload = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(payload["samples"][-1]["creditBalance"], 8)
        self.assertEqual(second["history"]["creditPeriods"]["1h"]["consumed"], 4)

    def test_reset_timestamp_jitter_does_not_create_phantom_usage(self) -> None:
        now = 1_800_000_000
        samples = [
            self.sample(now - 3700, 25, 1000),
            self.sample(now - 1800, 29, 1001),
            self.sample(now, 29, 1000),
        ]

        history = build_usage_history(self.snapshot(now, 29, 1000), samples)
        periods = history["windows"][0]["periods"]
        self.assertEqual(periods["1h"]["consumedPercent"], 4)
        self.assertEqual(periods["4h"]["consumedPercent"], 4)

    def test_capped_usage_does_not_replay_on_reset_timestamp_drift(self) -> None:
        now = 1_800_000_000
        samples = [
            self.sample(now - 1800, 100, 1000),
            self.sample(now, 100, 4000),
        ]

        history = build_usage_history(self.snapshot(now, 100, 4000), samples)
        periods = history["windows"][0]["periods"]
        self.assertEqual(periods["1h"]["consumedPercent"], 0)

    def test_partial_history_keeps_observed_activity(self) -> None:
        now = 1_800_000_000
        samples = [self.sample(now - 1800, 10), self.sample(now, 15)]

        window = build_usage_history(self.snapshot(now, 15), samples)["windows"][0]
        self.assertFalse(window["periods"]["1h"]["complete"])
        self.assertEqual(window["periods"]["1h"]["consumedPercent"], 5)
        self.assertEqual(
            window["activity24h"][0],
            {"consumedPercent": 0, "complete": False, "observed": False},
        )
        self.assertEqual(
            window["activity24h"][-1],
            {"consumedPercent": 5, "complete": False, "observed": True},
        )
        self.assertEqual(window["trackedSince"], now - 1800)

    def test_history_file_contains_only_minimal_samples_and_is_private(self) -> None:
        now = 1_800_000_000
        snapshot = self.snapshot(now, 15)
        with TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            update_usage_history(snapshot, path)
            text = path.read_text(encoding="utf-8")

            self.assertIn(f'"{ACCOUNT_LIMIT_ID}:10080"', text)
            self.assertIn('"creditBalance":0', text)
            self.assertNotIn("credits", text)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertIn("history", snapshot)

    def test_history_is_built_for_every_active_window(self) -> None:
        now = 1_800_000_000
        snapshot = self.snapshot(now, 15)
        snapshot["limits"][0]["windows"].insert(
            0,
            {
                "durationMinutes": 300,
                "usedPercent": 4,
                "remainingPercent": 96,
                "resetsAt": 8888,
            },
        )
        samples = [
            {
                "timestamp": now,
                "windows": {
                    f"{ACCOUNT_LIMIT_ID}:300": {"usedPercent": 4, "resetsAt": 8888},
                    f"{ACCOUNT_LIMIT_ID}:10080": {"usedPercent": 15, "resetsAt": 9999},
                },
            }
        ]

        history = build_usage_history(snapshot, samples)
        self.assertEqual(
            [window["durationMinutes"] for window in history["windows"]],
            [300, 10080],
        )
        self.assertEqual(
            [window["label"] for window in history["windows"]],
            ["Z.ai Coding Plan", "Z.ai Coding Plan"],
        )


if __name__ == "__main__":
    unittest.main()
