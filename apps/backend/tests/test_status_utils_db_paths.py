
# Module under test
import app.status_utils as su

# Direct import of the short module path used inside status_utils ("from app.db import engine")
import app.db as app_db


def test_check_db_reuses_global_engine(monkeypatch):
    """If status_utils sees the same DB URL as app.db.engine.url, it reuses the global engine
    and does NOT call create_engine()."""
    used_create_engine = False

    class FakeConn:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            pass

        def execute(self, *a, **k):
            return None

    class FakeEngine:
        def __init__(self, url="sqlite:///reused.db"):
            self.url = url

        def connect(self):
            return FakeConn()

    # Patch global engine to a known URL (must patch app.db.engine because status_utils imports from app.db)
    monkeypatch.setattr(app_db, "engine", FakeEngine("sqlite:///same.db"), raising=True)

    # Guard creation path: if called, fail test
    def nope(*a, **k):
        nonlocal used_create_engine
        used_create_engine = True
        raise AssertionError("create_engine() should not be invoked when URLs match")

    monkeypatch.setattr(su, "create_engine", nope, raising=True)

    # Call with matching URL
    out = su.check_db("sqlite:///same.db")
    assert out.ok is True, out
    assert used_create_engine is False


def test_check_db_ephemeral_engine_failure(monkeypatch):
    """When URLs differ, an ephemeral engine is created and failures are reported gracefully."""

    class FakeGlobalEngine:
        def __init__(self):
            self.url = "sqlite:///other.db"

    # Patch the global engine on the actual module referenced by status_utils
    monkeypatch.setattr(app_db, "engine", FakeGlobalEngine(), raising=True)

    target_url = "sqlite:///ephemeral.db"

    class BadEngine:
        def __init__(self, url):
            self.url = url

        def connect(self):
            raise RuntimeError("boom: cannot connect")

    seen = {"url": None}

    def fake_create_engine(url, *a, **k):
        seen["url"] = url
        return BadEngine(url)

    monkeypatch.setattr(su, "create_engine", fake_create_engine, raising=True)

    out = su.check_db(target_url)
    assert out.ok is False
    assert out.error is not None
    assert seen["url"] == target_url
