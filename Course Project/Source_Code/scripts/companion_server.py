#!/usr/bin/env python3
"""
AURA Proctor Companion Persistent Local Server
Serves the dedicated host-based Proctor Companion GUI on http://127.0.0.1:4200
"""

import http.server
import socketserver
import os
from pathlib import Path

PORT = 4200
BASE_DIR = Path(__file__).resolve().parent.parent
STAGING_DIR = BASE_DIR / "packages/proctor-companion/dist/staging"

class CompanionHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STAGING_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def guess_type(self, path):
        if str(path).endswith(".js") or str(path).endswith(".mjs"):
            return "application/javascript"
        if str(path).endswith(".html"):
            return "text/html"
        if str(path).endswith(".task"):
            return "application/octet-stream"
        if str(path).endswith(".wasm"):
            return "application/wasm"
        return super().guess_type(path)

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    print(f"Starting AURA Proctor Companion Server on http://127.0.0.1:{PORT}")
    with socketserver.TCPServer(("127.0.0.1", PORT), CompanionHandler) as httpd:
        httpd.serve_forever()
