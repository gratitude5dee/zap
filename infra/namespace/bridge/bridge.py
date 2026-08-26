#!/usr/bin/env python3
"""The Zap control bridge for native (non-container) Namespace instances.

Namespace's command service only runs commands in containers; a native macOS
instance needs this tiny HTTP server so the control plane can reach it: exec
plus file read/write, the same primitives the Box command API gives it.

Reached only through the authenticated Namespace ingress (its bearer check
stays ON for this port), and every request must ALSO carry the per-instance
token in X-Zap-Bridge-Token, so neither the workspace token nor the bridge
token alone reaches the instance's filesystem.

Endpoints (JSON):
  GET  /v1/health            -> {"ready": true}   once setup.sh finished
  POST /v1/command           {"command", "timeoutSeconds"} -> {exitCode, stdout, stderr}
  GET  /v1/files?path=...    -> {"content"}
  PUT  /v1/files             {"path", "content"} -> {"ok": true}

stdlib only: the bridge must be alive before anything is installed.
"""

import hmac
import json
import os
import pathlib
import subprocess
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ["RUNTIME_TOKEN"]
PORT = int(os.environ.get("ZAP_BRIDGE_PORT", "8722"))
READY_FILE = pathlib.Path.home() / ".zap" / ".bootstrap-complete"
MAX_BODY = 32 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "zap-bridge/1"

    def _authed(self) -> bool:
        supplied = self.headers.get("X-Zap-Bridge-Token", "")
        return hmac.compare_digest(supplied, TOKEN)

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY:
            raise ValueError("body too large")
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/v1/health":
            self._send(200, {"ready": READY_FILE.exists()})
            return
        if not self._authed():
            self._send(401, {"error": "unauthorized"})
            return
        if parsed.path == "/v1/files":
            params = urllib.parse.parse_qs(parsed.query)
            path = pathlib.Path(params.get("path", [""])[0]).expanduser()
            if not path.is_file():
                self._send(404, {"error": "not found"})
                return
            self._send(200, {"content": path.read_text(errors="replace")})
            return
        self._send(404, {"error": "unknown route"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authed():
            self._send(401, {"error": "unauthorized"})
            return
        if self.path != "/v1/command":
            self._send(404, {"error": "unknown route"})
            return
        try:
            body = self._body()
            result = subprocess.run(
                ["/bin/bash", "-lc", body["command"]],
                capture_output=True,
                text=True,
                timeout=float(body.get("timeoutSeconds", 600)),
            )
            self._send(200, {
                "exitCode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            })
        except subprocess.TimeoutExpired:
            self._send(200, {"exitCode": 124, "stdout": "", "stderr": "timed out"})
        except Exception as err:  # noqa: BLE001
            self._send(400, {"error": str(err)})

    def do_PUT(self) -> None:  # noqa: N802
        if not self._authed():
            self._send(401, {"error": "unauthorized"})
            return
        if self.path != "/v1/files":
            self._send(404, {"error": "unknown route"})
            return
        try:
            body = self._body()
            path = pathlib.Path(body["path"]).expanduser()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body["content"])
            self._send(200, {"ok": True})
        except Exception as err:  # noqa: BLE001
            self._send(400, {"error": str(err)})

    def log_message(self, fmt: str, *args: object) -> None:
        # Never log request lines: URLs can carry paths, never tokens, but the
        # bridge stays silent by default anyway.
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
