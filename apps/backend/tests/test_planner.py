from app.main import app
from fastapi.testclient import TestClient

def test_preview_and_apply():
    client = TestClient(app)

    r = client.post("/agent/plan/preview", json={"month": None})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert "items" in data

    r2 = client.post("/agent/plan/apply", json={"month": data.get("month"), "actions": []})
    assert r2.status_code == 200, r2.text
    assert r2.json().get("ok") is True
