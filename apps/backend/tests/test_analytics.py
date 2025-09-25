from fastapi.testclient import TestClient
from app.main import app

def test_track_ok():
    c = TestClient(app)
    r = c.post("/analytics/track", json={"event":"chat_fallback_used","props":{"provider":"openai"}})
    assert r.status_code == 204


def test_track_reject_big_props():
    c = TestClient(app)
    big = "x" * 5000
    r = c.post("/analytics/track", json={"event":"e","props":{"big":big}})
    assert r.status_code in (204, 413)
