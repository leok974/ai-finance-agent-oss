import os
import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_plan_debug_hidden_in_non_dev(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    r = client.get("/agent/plan/debug?q=top merchants for July and pdf")
    assert r.status_code == 404


def test_plan_debug_plan_only(monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    r = client.get("/agent/plan/debug?q=top merchants for July and pdf")
    assert r.status_code == 200
    j = r.json()
    assert j["ok"] is True
    assert j["mode"] == "plan-only"
    assert "plan" in j and "steps" in j["plan"]
    # Expect merchants + pdf in fallback
    tools = [s["tool"] for s in j["plan"]["steps"]]
    assert "charts.merchants" in tools
    assert "report.pdf" in tools


def test_plan_debug_execute(monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    # This will hit your charts/report helpers; seed sample data first if needed
    r = client.get("/agent/plan/debug?q=top merchants for July and pdf&run=1")
    assert r.status_code == 200
    j = r.json()
    assert j["ok"] is True
    assert j["mode"] == "executed"
    assert "tool_trace" in j
    # Reply preview should include a human one-liner
    assert "reply_preview" in j
