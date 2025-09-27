"""Pytest configuration & hermetic environment shims.

Adds lightweight dependency stubs so the hermetic test harness can run
without installing heavy third-party wheels (e.g. cryptography, annotated_types).

If the real dependency is present, the stub is skipped automatically.
"""
import contextlib
import importlib.util
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]  # .../apps/backend
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# ---------------------------------------------------------------------------
# Stub injection (must occur BEFORE importing app.main / pydantic)
# ---------------------------------------------------------------------------
_STUB_DIR = BACKEND_ROOT / "app" / "_stubs"

def _ensure_stub(module_name: str, filename: str):
    """Import a stub module under `module_name` if the real one is missing.

    We do a very lightweight existence check using importlib.util.find_spec
    to avoid triggering partial imports that might themselves crash.
    """
    if importlib.util.find_spec(module_name) is not None:
        return  # real module exists
    stub_path = _STUB_DIR / filename
    if not stub_path.is_file():
        return  # nothing to load; tests may fail but we don't hard error here
    spec = importlib.util.spec_from_file_location(module_name, stub_path)
    if spec and spec.loader:
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)  # type: ignore

# NOTE: We intentionally do NOT stub 'annotated_types' anymore because FastAPI/Pydantic
# rely on runtime constraint classes (MinLen, MaxLen, etc.) having specific attributes.
# A previous lightweight stub broke schema generation (missing 'min_length'). If a
# real install is absent, tests that require it should fail loudly rather than
# silently degrade. (If absolutely necessary, reintroduce a richer stub.)
 # apps/backend/tests/conftest.py
import os
import sys
import warnings
from pathlib import Path

# Standardize environment for tests: disable auth/CSRF and crypto init
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DEV_ALLOW_NO_AUTH", "1")
os.environ.setdefault("DEV_ALLOW_NO_CSRF", "1")
os.environ.setdefault("ENCRYPTION_ENABLED", "0")

# Suppress noisy library warnings that clutter pytest output
warnings.filterwarnings(
    "ignore",
    message="No supported index is available",
    category=FutureWarning,
    module="statsmodels.tsa.base.tsa_model",
)

# Make "apps/backend" importable as root so "app.*" works
ROOT = Path(__file__).resolve().parents[1]  # .../apps/backend
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import pytest
import os
import httpx

# Mark this module's tests / fixtures as HTTP API related so hermetic runs exclude it
pytestmark = pytest.mark.httpapi  # collected only in full (non-hermetic) test runs

if os.getenv("HERMETIC") == "1":
    # In hermetic mode avoid importing FastAPI app entirely; provide placeholders.
    from types import SimpleNamespace

    @pytest.fixture
    def client():  # pragma: no cover - hermetic placeholder
        pytest.skip("HTTP client fixture skipped in hermetic mode")
        yield SimpleNamespace()
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

if os.getenv("HERMETIC") != "1":
    from app.main import app
    from app.db import Base, get_db
    import app.db as app_db          # we'll monkeypatch this module's globals
    from app import orm_models        # ensure models are registered with Base
    from app.core import env as app_env

    @pytest.fixture(scope="session")
    def asgi_app():
        return app

    @pytest.fixture
    async def asgi_client(asgi_app):
        transport = httpx.ASGITransport(app=asgi_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            yield client
        with contextlib.suppress(Exception):
            close_fn = getattr(transport, "close", None)
            if close_fn:
                close_fn()
else:
    @pytest.fixture(scope="session")
    def asgi_app():  # pragma: no cover - hermetic placeholder
        pytest.skip("ASGI app unavailable in hermetic mode")

    @pytest.fixture
    async def asgi_client():  # pragma: no cover - hermetic placeholder
        pytest.skip("ASGI client unavailable in hermetic mode")

import pytest

@pytest.fixture(autouse=True, scope="session")
def _hermetic_env():
    # Session-scoped environment normalization (no monkeypatch to avoid scope mismatch)
    os.environ["APP_ENV"] = "test"
    os.environ["DEV_ALLOW_NO_LLM"] = "1"
    os.environ["DEV_ALLOW_NO_AUTH"] = "1"
    os.environ["DEV_ALLOW_NO_CSRF"] = "1"
    # Extend with additional centralized flags as needed.
    yield


@pytest.fixture(scope="session")
def anyio_backend():
    """Ensure pytest-anyio uses asyncio loop for async tests."""
    return "asyncio"


@pytest.fixture(scope="session")
def _engine():
    if os.getenv("HERMETIC") == "1":
        pytest.skip("Engine fixture skipped in hermetic mode (httpapi)")
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="session")
def _SessionLocal(_engine):
    if os.getenv("HERMETIC") == "1":
        pytest.skip("DB session fixture skipped in hermetic mode (HTTP path)")
    return sessionmaker(bind=_engine, autocommit=False, autoflush=False, future=True)


@pytest.fixture(autouse=True, scope="session")
def _force_sqlite_for_all_tests(_engine, _SessionLocal):
    if os.getenv("HERMETIC") == "1":
        pytest.skip("force sqlite override skipped (hermetic)")
    """
    Autouse: before any test runs, force the app to use our SQLite engine/session,
    even if some code imports app.db.SessionLocal directly or reads env vars.
    """
    # Prevent any env-driven reconnects to Postgres inside the app
    os.environ.pop("DATABASE_URL", None)

    # Monkeypatch app.db globals
    app_db.engine = _engine
    app_db.SessionLocal = _SessionLocal

    # Make dependency override globally active
    def override_get_db():
        db = _SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[app_db.get_db] = override_get_db
    yield
    app.dependency_overrides.pop(app_db.get_db, None)


## Legacy sync TestClient fixture removed to avoid annotated_types schema issues.


# --- ensure imports like "from app.transactions import Transaction" work ---
import sys as _sys
from pathlib import Path as _Path
import pytest

BACKEND_ROOT = _Path(__file__).resolve().parents[1]  # .../apps/backend
if str(BACKEND_ROOT) not in _sys.path:
    _sys.path.insert(0, str(BACKEND_ROOT))

@pytest.fixture
def db_session():
    if os.getenv("HERMETIC") == "1":
        pytest.skip("db_session skipped in hermetic mode")
    """
    Yields a SQLAlchemy session bound to the same engine your app uses.
    The existing `client` fixture can use its own override; this is just
    for direct DB writes in tests (e.g., creating a Transaction row).
    """
    # Ensure clean slate per test to avoid cross-test contamination
    try:
        app_db.Base.metadata.drop_all(bind=app_db.engine)
    except Exception:
        pass
    app_db.Base.metadata.create_all(bind=app_db.engine)

    # Also clear any in-memory overlays/state between tests
    try:
        from app.utils.state import ANOMALY_IGNORES, TEMP_BUDGETS
        ANOMALY_IGNORES.clear()
        TEMP_BUDGETS.clear()
    except Exception:
        pass

    # Use module attribute so it picks up monkeypatch from _force_sqlite_for_all_tests
    db = app_db.SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _reset_in_memory_state():
    if os.getenv("HERMETIC") == "1":
        pytest.skip("state reset skipped in hermetic mode")
    """Snapshot & restore legacy in-memory lists (txns, rules, user_labels) per test.

    Prevents leakage between tests that rely on `app.state.*` onboarding behavior.
    Lightweight (list copy) vs. DB fixtures. Applied after db_session so DB is already clean.
    """
    try:
        txns_orig = list(getattr(app.state, "txns", []))
        rules_orig = list(getattr(app.state, "rules", []))
        labels_orig = list(getattr(app.state, "user_labels", []))
    except Exception:
        txns_orig, rules_orig, labels_orig = [], [], []
    yield
    try:
        app.state.txns = txns_orig
        app.state.rules = rules_orig
        app.state.user_labels = labels_orig
    except Exception:
        pass
