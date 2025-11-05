from fastapi.testclient import TestClient

from app.main import app


def test_version_shape_ok():
    c = TestClient(app)
    r = c.get("/version")
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"version", "commit", "built_at", "startup_ts"}
    assert isinstance(data["startup_ts"], int)
    assert isinstance(data["version"], str)
    assert isinstance(data["commit"], str)
    assert isinstance(data["built_at"], str)


def test_version_env_overrides(monkeypatch):
    monkeypatch.setenv("APP_VERSION", "v1.2.3")
    monkeypatch.setenv("APP_COMMIT", "abcdef1")
    monkeypatch.setenv("APP_BUILD_TIME", "2025-09-28T04:43:12Z")
    c = TestClient(app)
    d = c.get("/version").json()
    assert d["version"] == "v1.2.3"
    assert d["commit"].startswith("abc")
    assert d["built_at"].endswith("Z")
