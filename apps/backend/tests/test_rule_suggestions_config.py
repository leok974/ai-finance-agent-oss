import importlib
from app.main import app
from fastapi.testclient import TestClient
import app.services.rule_suggestions as rs

def test_config_endpoint_reflects_env(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("RULE_SUGGESTION_WINDOW_DAYS", "45")
    importlib.reload(rs)
    r = client.get("/rules/suggestions/config")
    assert r.status_code == 200
    data = r.json()
    assert data["window_days"] == 45
    assert "min_support" in data and "min_positive" in data


def test_config_disable_window(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("RULE_SUGGESTION_WINDOW_DAYS", "0")
    importlib.reload(rs)
    r = client.get("/rules/suggestions/config")
    assert r.status_code == 200
    assert r.json()["window_days"] is None
