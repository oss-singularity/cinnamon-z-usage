"""Real HTTP round trips against a local fixture of the Z.ai monitor API."""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import URLError

from z_usage import (
    AUTH_REQUIRED_MESSAGE,
    AuthenticationRequired,
    UsageError,
    fetch_quota_limits,
)


class _FixtureHandler(BaseHTTPRequestHandler):
    response_status = 200
    response_body = {}

    def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path != "/api/monitor/usage/quota/limit":
            self.send_response(404)
            self.end_headers()
            return
        if self.headers.get("Authorization") == "good-key":
            body = json.dumps(self.response_body).encode("utf-8")
            self.send_response(self.response_status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            body = json.dumps({"code": 401, "msg": "token expired or incorrect", "success": False}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, *_args):
        pass


class TransportTests(unittest.TestCase):
    def setUp(self):
        _FixtureHandler.response_status = 200
        _FixtureHandler.response_body = {}
        self.server = HTTPServer(("127.0.0.1", 0), _FixtureHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.thread.join)
        self.addCleanup(self.server.shutdown)
        self.addCleanup(self.server.server_close)
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def test_quota_payload_and_raw_authorization_header(self):
        _FixtureHandler.response_body = {"code": 200, "success": True, "data": {"limits": [{"percentage": 7}], "level": "max"}}
        data = fetch_quota_limits("good-key", self.base_url, 5)
        self.assertEqual(data["level"], "max")
        self.assertEqual(data["limits"][0]["percentage"], 7)

    def test_bad_key_maps_to_authentication_required(self):
        with self.assertRaisesRegex(AuthenticationRequired, "Z.ai API key"):
            fetch_quota_limits("bad-key", self.base_url, 5)
        self.assertEqual(AuthenticationRequired(AUTH_REQUIRED_MESSAGE).args[0].count("Z.ai"), 1)

    def test_missing_key_never_reaches_the_network(self):
        with self.assertRaises(AuthenticationRequired):
            fetch_quota_limits("", self.base_url, 5)

    def test_http_error_surfaces_as_usage_error(self):
        _FixtureHandler.response_status = 503
        with self.assertRaises(UsageError):
            fetch_quota_limits("good-key", self.base_url, 5)

    def test_unreachable_host_is_a_usage_error(self):
        with self.assertRaises((UsageError, URLError, OSError)):
            # Port 1 on the loopback interface is not serving HTTP.
            fetch_quota_limits("good-key", "http://127.0.0.1:1", 1)

    def test_invalid_timeout_is_rejected(self):
        with self.assertRaises(UsageError):
            fetch_quota_limits("good-key", self.base_url, float("nan"))


if __name__ == "__main__":
    unittest.main()
