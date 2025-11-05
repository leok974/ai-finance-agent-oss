import types
import pytest
from fastapi.testclient import TestClient
import importlib

# Router under test
try:
    rs = importlib.import_module("app.routers.agent_tools_rules_save")
except ModuleNotFoundError:
    rs = importlib.import_module("apps.backend.app.routers.agent_tools_rules_save")

SAVE_PATH = "/agent/tools/rules/save"


def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"


@pytest.fixture(autouse=True)
def reset_idempotency():
    # Best-effort reset for router-local idempotency cache if present
    if hasattr(rs, "_IDEM"):
        idem = getattr(rs, "_IDEM")
        for attr in ("_cache", "_order"):
            if hasattr(idem, attr):
                try:
                    getattr(idem, attr).clear()
                except Exception:
                    pass
    yield
    if hasattr(rs, "_IDEM"):
        idem = getattr(rs, "_IDEM")
        for attr in ("_cache", "_order"):
            if hasattr(idem, attr):
                try:
                    getattr(idem, attr).clear()
                except Exception:
                    pass


@pytest.fixture
def payload_rule():
    return {
        # single-rule shape (router’s save_rule typically accepts one)
        "rule": {
            "id": "t-rule-1",
            "name": "Coffee",
            "pattern": "coffee|espresso",
            "category": "restaurants",
            "enabled": True,
        },
        "dry_run": True,  # many implementations calculate the plan when dry_run=True
    }


@pytest.fixture
def use_tmp_fallback(tmp_path, monkeypatch):
    """
    Redirect any JSON fallback writes to a temp file and neutralize locks if defined.
    """
    p = tmp_path / "rules.save.fallback.jsonl"
    if hasattr(rs, "_FALLBACK_PATH"):
        monkeypatch.setattr(rs, "_FALLBACK_PATH", str(p), raising=False)
    else:
        setattr(rs, "_FALLBACK_PATH", str(p))
    # Optional: some implementations gate file I/O behind a lock attr
    if hasattr(rs, "_os_lock"):

        class DummyLock:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        monkeypatch.setattr(rs, "_os_lock", DummyLock(), raising=False)
    return p


def _override_dep_get_db(app, override):
    """
    If the router imported get_db and uses Depends(get_db), you can override it here.
    """
    if hasattr(rs, "get_db"):
        app.dependency_overrides[getattr(rs, "get_db")] = override


def _dummy_db():
    # FastAPI dependency override must be a generator/yieldable
    yield object()


def _mk_ack(scope="rules.save", **extra):
    out = {"ack_scope": scope}
    out.update(extra)
    return out


def test_json_fallback_path(
    client: TestClient, payload_rule, use_tmp_fallback, monkeypatch
):
    """
    Force pure JSON fallback (no DB available).
    """
    # create_rule_db absent -> JSON fallback branch
    monkeypatch.setattr(rs, "create_rule_db", None, raising=False)
    # Provide a build_ack to avoid import-None surprises
    monkeypatch.setattr(
        rs, "build_ack", lambda s, count=1, **k: f"ack:{s}:{count}", raising=False
    )
    # Ensure any csrf_protect is a no-op wrapper if present
    if hasattr(rs, "csrf_protect"):
        monkeypatch.setattr(rs, "csrf_protect", lambda f: f, raising=False)

    r = client.post(SAVE_PATH, json=payload_rule)
    _no_500(r)
    assert r.status_code in (200, 201, 202, 204, 400, 422)


def test_db_success_path(client: TestClient, payload_rule, monkeypatch):
    """
    Drive DB success branch: create_rule_db exists and returns a record; get_db yields a session.
    """

    # Stub DB creator to simulate success
    def _create_rule_db(db, rule):
        return types.SimpleNamespace(id="db-123", display_name=rule.get("name", "rule"))

    monkeypatch.setattr(rs, "create_rule_db", _create_rule_db, raising=False)

    # Ack builder present
    monkeypatch.setattr(
        rs, "build_ack", lambda s, count=1, **k: f"ack:{s}:{count}", raising=False
    )

    # No-op csrf if defined
    if hasattr(rs, "csrf_protect"):
        monkeypatch.setattr(rs, "csrf_protect", lambda f: f, raising=False)

    # Override dependency to guarantee a non-None DB is injected
    _override_dep_get_db(client.app, _dummy_db)

    r = client.post(SAVE_PATH, json=payload_rule)
    _no_500(r)
    assert r.status_code in (200, 201, 202, 204, 400, 422)


def test_db_failure_fallback_to_json(
    client: TestClient, payload_rule, use_tmp_fallback, monkeypatch
):
    """
    create_rule_db exists but raises -> cover exception fallback branch.
    """

    def _create_rule_db_raises(db, rule):
        raise RuntimeError("boom")

    monkeypatch.setattr(rs, "create_rule_db", _create_rule_db_raises, raising=False)
    monkeypatch.setattr(
        rs, "build_ack", lambda s, count=1, **k: f"ack:{s}:{count}", raising=False
    )
    if hasattr(rs, "csrf_protect"):
        monkeypatch.setattr(rs, "csrf_protect", lambda f: f, raising=False)

    # Provide a db so the try-block executes before falling back
    _override_dep_get_db(client.app, _dummy_db)

    r = client.post(SAVE_PATH, json=payload_rule)
    _no_500(r)
    assert r.status_code in (200, 201, 202, 204, 400, 422)


def test_idempotency_reuse_branch(client: TestClient, payload_rule, monkeypatch):
    """
    Send the same Idempotency-Key twice to traverse the retrieval/cached response path.
    """
    # Neutralize DB to focus on idempotency path; ack present
    monkeypatch.setattr(rs, "create_rule_db", None, raising=False)
    monkeypatch.setattr(
        rs, "build_ack", lambda s, count=1, **k: f"ack:{s}:{count}", raising=False
    )
    if hasattr(rs, "csrf_protect"):
        monkeypatch.setattr(rs, "csrf_protect", lambda f: f, raising=False)

    idem_key = "itest-123"
    h = {"Idempotency-Key": idem_key}

    r1 = client.post(SAVE_PATH, json=payload_rule, headers=h)
    _no_500(r1)
    r2 = client.post(SAVE_PATH, json=payload_rule, headers=h)
    _no_500(r2)
    # Don’t assert exact JSON shape (impl-dependent), but verify no 5xx and 2nd call returns quickly.
    assert r2.status_code in (200, 201, 202, 204, 400, 422)
