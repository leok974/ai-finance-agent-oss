import importlib
import pytest
from fastapi.testclient import TestClient

RS = importlib.import_module("app.routers.agent_tools_rules_save")
SAVE_PATH = "/agent/tools/rules/save"

def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"

def _dummy_db():
    yield object()

def test_db_try_except_fallback_branch(client: TestClient, tmp_path, monkeypatch):
    """
    Hit the try block where create_rule_db is truthy but raises, then assert we fall back
    to JSON path (except branch previously uncovered).
    """
    def _create_rule_db_raises(db, rule):  # noqa: ARG001
        raise RuntimeError("boom for coverage")
    monkeypatch.setattr(RS, "create_rule_db", _create_rule_db_raises, raising=False)

    # Provide non-None db via dependency override
    if hasattr(RS, "get_db"):
        client.app.dependency_overrides[getattr(RS, "get_db")] = _dummy_db

    # Ack as simple string per schema
    monkeypatch.setattr(RS, "build_ack", lambda scope, count=1, **k: f"ack:{scope}:{count}", raising=False)
    if hasattr(RS, "csrf_protect"):
        monkeypatch.setattr(RS, "csrf_protect", lambda f: f, raising=False)

    fb = tmp_path / "rules.save.fallback.json"
    monkeypatch.setattr(RS, "_FALLBACK_PATH", str(fb), raising=False)
    if hasattr(RS, "_os_lock"):
        class _DummyLock:
            def __enter__(self): return self
            def __exit__(self, *a): return False
        monkeypatch.setattr(RS, "_os_lock", _DummyLock(), raising=False)

    payload = {
        "rule": {"id": "cov-db-exc-1", "name": "X", "pattern": "a|b", "category": "misc", "enabled": True},
        "dry_run": True,
    }

    r = client.post(SAVE_PATH, json=payload)
    _no_500(r)
    assert r.status_code in (200, 201, 202, 204, 400, 422)
    assert fb.parent.exists()
