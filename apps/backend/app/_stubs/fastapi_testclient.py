"""Minimal fastapi.testclient stub for hermetic mode.
Provides a TestClient with no real HTTP capability; any request returns a 501-like stub response.
Only loaded when real fastapi is absent and HERMETIC=1.
"""
from __future__ import annotations

class _Response:
    def __init__(self, status_code: int = 501, text: str = "TestClient stubbed in hermetic mode"):
        self.status_code = status_code
        self.text = text
        self.content = text.encode()

    def json(self):  # pragma: no cover - simple stub
        raise RuntimeError(self.text)

class TestClient:  # pragma: no cover - behavior trivial
    __test__ = False  # Prevent pytest from attempting to collect this as a test

    def __init__(self, app, **_):
        self.app = app

    def __repr__(self):  # pragma: no cover - trivial
        return "<HermeticTestClient stub>"

    def request(self, *_, **__):
        return _Response()

    # Common verb shortcuts all alias to request
    get = post = put = delete = patch = head = options = request

__all__ = ["TestClient"]
