from app import status_utils


def test_check_migrations_unavailable(monkeypatch):
    # Force Alembic modules to appear unavailable
    monkeypatch.setattr(status_utils, "AlembicConfig", None)
    st = status_utils.check_migrations("alembic.ini")
    assert st.ok is False
    assert st.error == "alembic_unavailable"


def test_check_migrations_success(monkeypatch):
    # Fabricate minimal objects to mimic alembic behavior
    class FakeScriptDir:
        def __init__(self):
            self._head = "rev_head"

        @classmethod
        def from_config(cls, cfg):
            return cls()

        def get_current_head(self):
            return self._head

        def run_env(self):
            # trigger EnvironmentContext fn capture by invoking fn with fake context
            pass

    captured_fn = {}

    class FakeEnvCtx:
        def __init__(self, cfg, script, fn=None):
            self.fn = fn

        def __enter__(self):
            # Provide a minimal context with get_current_revision
            class Ctx:
                def get_current_revision(self_inner):
                    return "rev_head"

            if self.fn:
                self.fn(None, Ctx())
            return self

        def __exit__(self, *a):
            return False

    class FakeCfg:
        def __init__(self, path):
            self.path = path

    monkeypatch.setattr(status_utils, "AlembicConfig", FakeCfg)
    monkeypatch.setattr(status_utils, "ScriptDirectory", FakeScriptDir)
    monkeypatch.setattr(status_utils, "EnvironmentContext", FakeEnvCtx)
    st = status_utils.check_migrations("alembic.ini")
    assert st.ok is True
    assert st.current == st.head == "rev_head"


def test_check_migrations_failure(monkeypatch):
    class BadCfg:
        def __init__(self, path):
            raise RuntimeError("boom")

    monkeypatch.setattr(status_utils, "AlembicConfig", BadCfg)
    st = status_utils.check_migrations("alembic.ini")
    assert st.ok is False
    assert st.error == "RuntimeError"


def test_check_llm_health_timeout(monkeypatch):
    # Force an exception in check_llm_health_sync by monkeypatching os.getenv
    def bad_getenv(key, default=None):
        raise TimeoutError("LLM timeout")

    monkeypatch.setattr(status_utils.os, "getenv", bad_getenv)
    st = status_utils.check_llm_health_sync()
    assert st.ok is False
    assert st.error == "TimeoutError"


def test_check_llm_health_other_exception(monkeypatch):
    def bad_getenv(key, default=None):
        raise ValueError("weird")

    monkeypatch.setattr(status_utils.os, "getenv", bad_getenv)
    st = status_utils.check_llm_health_sync()
    assert st.ok is False
    assert st.error == "ValueError"
