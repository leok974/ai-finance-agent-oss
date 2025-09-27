import os
import sys
import pytest

pytestmark = pytest.mark.httpapi

try:
    from fastapi.testclient import TestClient  # type: ignore
except Exception:  # pragma: no cover
    TestClient = None  # type: ignore


def _reload_app_with_env(app_env: str):
    prev = os.environ.get("APP_ENV")
    os.environ["APP_ENV"] = app_env
    # Remove cached module so it re-executes with new env branch (middleware conditional)
    if "app.main" in sys.modules:
        del sys.modules["app.main"]
    import app.main as main_mod  # type: ignore  # noqa: F401
    return main_mod.app, prev


def _restore_app_env(prev_env):
    if "app.main" in sys.modules:
        del sys.modules["app.main"]
    if prev_env is None:
        os.environ.pop("APP_ENV", None)
    else:
        os.environ["APP_ENV"] = prev_env
    # Recreate original (test) app so other tests are unaffected
    os.environ.setdefault("APP_ENV", "test")
    if "app.main" in sys.modules:
        del sys.modules["app.main"]
    import app.main  # noqa: F401  # restore baseline


@pytest.mark.integration
def test_healthz_rejects_untrusted_host():
    if TestClient is None:
        pytest.skip("TestClient unavailable")
    try:
        app, prev = _reload_app_with_env("prod")
        client = TestClient(app)
        r = client.get("/healthz", headers={"Host": "bad.invalid"})
        assert r.status_code == 400, f"Expected 400 for untrusted host, got {r.status_code}: {r.text}"
    except ModuleNotFoundError as e:
        pytest.skip(f"Dependency missing: {e}")
    finally:
        _restore_app_env(prev)


@pytest.mark.integration
def test_healthz_valid_host_payload_shape():
    if TestClient is None:
        pytest.skip("TestClient unavailable")
    try:
        app, prev = _reload_app_with_env("prod")
        client = TestClient(app)
        r = client.get("/healthz", headers={"Host": "backend"})
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ["ok", "status", "reasons", "info_reasons", "warn_reasons", "db", "alembic", "version"]:
            assert key in data, f"Missing key: {key}"
        assert isinstance(data["reasons"], list)
        assert isinstance(data["info_reasons"], list)
        assert isinstance(data["warn_reasons"], list)
        assert isinstance(data["db"], dict)
        assert isinstance(data["alembic"], dict)
        if data["ok"]:
            assert data["status"] == "ok"
        else:
            assert data["status"] in {"degraded"}
    except ModuleNotFoundError as e:
        pytest.skip(f"Dependency missing: {e}")
    finally:
        _restore_app_env(prev)
