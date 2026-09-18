"""Invalid input and rolling time boundaries, independent of chart alignment."""

import unittest
from unittest.mock import patch

from z_usage import normalise_quota_limits


class RobustnessTests(unittest.TestCase):
    def test_invalid_usage_never_becomes_full_availability(self):
        for used in [None, float("nan"), float("inf"), -1, 101, True, "bad"]:
            with self.subTest(used=used):
                data = {"limits": [{"unit": 3, "number": 5, "percentage": used}]}
                self.assertEqual(normalise_quota_limits(data)["limits"], [])

    def test_invalid_reset_times_never_crash(self):
        for bad in [float("inf"), float("-inf"), float("nan"), True, "soon"]:
            with self.subTest(bad=bad):
                data = {"limits": [{"unit": 3, "number": 5, "percentage": 5, "nextResetTime": bad}]}
                snapshot = normalise_quota_limits(data)
                self.assertEqual(len(snapshot["limits"]), 1)
                self.assertIsNone(snapshot["limits"][0]["windows"][0]["resetsAt"])

    def test_balance_ignores_negative_and_missing_credit_windows(self):
        data = {
            "limits": [
                {
                    "unit": 3,
                    "number": 5,
                    "percentage": 50,
                    "currentValue": 10,
                    "usage": 4,
                }
            ]
        }
        self.assertIsNone(normalise_quota_limits(data)["credits"]["balance"])

        data = {
            "limits": [
                {
                    "unit": 3,
                    "number": 5,
                    "percentage": 50,
                    "currentValue": 4,
                    "usage": 10,
                }
            ]
        }
        self.assertEqual(normalise_quota_limits(data)["credits"]["balance"], "6.0")

    def test_zero_usage_reports_a_full_window(self):
        data = {"limits": [{"unit": 3, "number": 5, "percentage": 0}]}
        windows = normalise_quota_limits(data)["limits"][0]["windows"]
        self.assertEqual(windows[0]["remainingPercent"], 100)

    def test_normalisation_is_pure_in_the_seconds_domain(self):
        data = {
            "limits": [
                {
                    "unit": 6,
                    "number": 1,
                    "percentage": 3,
                    "nextResetTime": 1790064603989,
                }
            ]
        }
        with patch("z_usage.time.time", return_value=1789474928.0):
            snapshot = normalise_quota_limits(data)
        self.assertEqual(snapshot["updatedAt"], 1789474928)
        self.assertEqual(snapshot["limits"][0]["windows"][0]["resetsAt"], 1790064603)
