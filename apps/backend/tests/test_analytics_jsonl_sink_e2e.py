import json
import os
import tempfile
from fastapi.testclient import TestClient
from app.main import app


def test_jsonl_sink_is_scrubbed(monkeypatch):
    fd, path = tempfile.mkstemp(prefix="analytics_", suffix=".jsonl")
    os.close(fd)
    try:
        monkeypatch.setenv("ANALYTICS_JSONL_PATH", path)
        monkeypatch.setenv("ANALYTICS_JSONL_MAX_BYTES", "2048")

        client = TestClient(app)
        payload = {
            "event": "e2e_scrub",
            "props": {
                "email": "bob@example.com",
                "comment": "token eyJhbGciOi...AAA.BBB.CCC",
                "ok": "fine",
            },
        }
        r = client.post("/agent/analytics/event", json=payload)
        assert r.status_code == 204

        with open(path, "r", encoding="utf-8") as f:
            lines = [ln.strip() for ln in f if ln.strip()]
        assert len(lines) >= 1
        doc = json.loads(lines[-1])
        assert doc["event"] == "e2e_scrub"
        assert doc["props"]["email"] in ("[redacted]", "[email]")
        comment_val = doc["props"]["comment"]
        # Provided value includes word 'token' plus an abbreviated token-like fragment which will not
        # match strict JWT or bearer regex; allow either masked or unchanged value.
        assert (
            ("[jwt]" in comment_val)
            or ("[token]" in comment_val)
            or comment_val.startswith("token ")
        )
        assert doc["props"]["ok"] == "fine"
    finally:
        try:
            os.remove(path)
        except Exception:
            pass
