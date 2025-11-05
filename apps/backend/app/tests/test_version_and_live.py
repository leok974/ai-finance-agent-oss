from fastapi.testclient import TestClient  # type: ignore
from app.main import app


def test_live():
    with TestClient(app) as c:
        r = c.get("/live")
        assert r.status_code == 200
        assert r.json().get("ok") is True


def test_version_endpoint():
    with TestClient(app) as c:
        r = c.get("/version")
        assert r.status_code == 200
        data = r.json()
        assert "branch" in data and "commit" in data and "build_time" in data
