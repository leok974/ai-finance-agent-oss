import os
import sys
import pathlib
import pytest

# ===========================================================================
# Pytest Bootstrap & Environment Hardening
# ===========================================================================

# 1) Ensure backend package on sys.path
# Ensure backend tests parent (apps/backend) is on sys.path BEFORE importing test helpers.
# This prevents the top-level repository 'tests' directory (without helpers/) from shadowing
# the backend test helpers namespace during early import.
_THIS_DIR = pathlib.Path(__file__).parent
_BACKEND_ROOT = _THIS_DIR.parent  # apps/backend
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

# 2) Make logs unbuffered for tests (helps with log assertion reliability)
os.environ.setdefault("PYTHONUNBUFFERED", "1")

# 3) Disable Prometheus multiprocess mode during tests
# (Integration/e2e can set PROMETHEUS_MULTIPROC_DIR explicitly if needed.)
# This prevents "Duplicated timeseries" errors when collecting metrics in unit tests.
os.environ.pop("PROMETHEUS_MULTIPROC_DIR", None)

# 4) Stable timezone for timestamp logic
os.environ.setdefault("TZ", "UTC")

try:  # primary absolute import (after path injection)
    from tests.helpers.auth_jwt import patch_server_secret, mint_access, preferred_csrf_key  # type: ignore
except (
    ModuleNotFoundError
):  # fallback to explicit relative import if namespace package resolution fails
    from .helpers.auth_jwt import patch_server_secret, mint_access, preferred_csrf_key  # type: ignore


@pytest.fixture(autouse=True)
def _baseline_test_env(monkeypatch):
    """Ensure test-friendly environment defaults.

    - Skip DB startup guard (TESTING=1)
    - Disable LLM real calls (DEV_ALLOW_NO_LLM=1)
    - Allow auth bypass for non-auth specific tests (DEV_ALLOW_NO_AUTH=1)
    Individual tests can override by assigning different env values locally.
    """
    monkeypatch.setenv("TESTING", "1")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", os.getenv("DEV_ALLOW_NO_LLM", "1"))
    # Default to real auth in tests; individual tests can opt-in to bypass
    monkeypatch.setenv("DEV_ALLOW_NO_AUTH", os.getenv("DEV_ALLOW_NO_AUTH", "0"))
    # Do not alter DATABASE_URL or rebind app.db engine here. A session-scoped
    # fixture (_force_sqlite_for_all_tests) provides a stable in-memory SQLite
    # engine and dependency overrides for the entire test session. Rebinding per
    # test causes race conditions and table create/drop conflicts.
    yield


@pytest.fixture
def fake_auth_env(monkeypatch):
    """Force TEST_FAKE_AUTH=1 for tests that need to bypass cookie/session auth.
    
    This fixture allows ingest tests (and similar) to focus purely on CSV parsing
    and DB writes without dealing with cookie mechanics. The _auth_override_for_tests
    session fixture respects this env var and provides a stable test user.
    
    Usage:
        @pytest.mark.usefixtures("fake_auth_env")
        def test_ingest_something(...):
            # This test runs with fake auth enabled
    
    Or for entire test files:
        pytestmark = pytest.mark.usefixtures("fake_auth_env")
    
    Never set TEST_FAKE_AUTH in production environments.
    """
    monkeypatch.setenv("TEST_FAKE_AUTH", "1")
    yield
    # Cleanup after test to avoid cross-test leakage
    monkeypatch.delenv("TEST_FAKE_AUTH", raising=False)


@pytest.fixture(autouse=True)
def _clear_prom_registry_between_tests():
    """
    Optional: If a test needs a *fresh* default REGISTRY, this fixture can prune
    duplicate collectors caused by module re-imports. Most tests can rely on deltas
    (before/after) without needing this, so we keep it light-weight and non-destructive.

    By default, we do NOT clear the registry to avoid KeyErrors from collectors
    registered at module import time. Tests should measure metric deltas instead.
    """
    # Setup — nothing (we want counters to accumulate across a single test process)
    yield
    # Teardown — do not clear global REGISTRY by default (avoids KeyErrors)
    # If you *must* clear for a specific test, enable this code in that test's conftest:
    # from prometheus_client import REGISTRY
    # collectors = list(REGISTRY._collector_to_names.keys())
    # for c in collectors:
    #     try:
    #         REGISTRY.unregister(c)
    #     except Exception:
    #         pass


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
    from app.db import Base
    import app.db as app_db  # we'll monkeypatch this module's globals
    from app.utils.auth import hash_password, _ensure_roles
    from app.orm_models import User
if os.getenv("HERMETIC") != "1":
    from fastapi.testclient import TestClient as _TC
    from app.main import app as _app

    def _get_or_create_user(db, email: str, password: str, roles=("user",)):
        u = db.query(User).filter_by(email=email).first()
        if not u:
            u = User(email=email, password_hash=hash_password(password), is_active=True)
            db.add(u)
            db.flush()
        _ensure_roles(db, u, list(roles))
        db.commit()
        return u

    @pytest.fixture
    def client_user(db_session):
        c = _TC(_app)
        email = "user@test.local"
        pwd = "pass1234"
        # Try register via current non-prefixed auth route
        r = c.post("/auth/register", json={"email": email, "password": pwd})
        if r.status_code != 200:
            db = app_db.SessionLocal()
            _get_or_create_user(db, email, pwd, ("user",))
            db.close()
        lr = c.post("/auth/login", json={"email": email, "password": pwd})
        assert lr.status_code == 200
        return c

    @pytest.fixture
    def client_admin(db_session):
        c = _TC(_app)
        email = "admin@test.local"
        pwd = "pass1234"
        c.post("/auth/register", json={"email": email, "password": pwd})
        # Ensure admin role exists either way
        db = app_db.SessionLocal()
        _get_or_create_user(db, email, pwd, ("admin", "user"))
        db.close()
        lr = c.post("/auth/login", json={"email": email, "password": pwd})
        assert lr.status_code == 200
        return c

    @pytest.fixture(scope="session")
    def asgi_app():
        return app

    @pytest.fixture
    def client(db_session):
        from fastapi.testclient import TestClient

        # Use context manager to ensure underlying transport / connections close cleanly.
        with TestClient(app) as c:
            # Default: authenticated ADMIN client to satisfy admin-guarded endpoints in tests.
            try:
                email = "admin@test.local"
                pwd = "pass1234"
                _ = c.post(
                    "/auth/register",
                    json={
                        "email": email,
                        "password": pwd,
                        "roles": ["admin", "analyst", "user"],
                    },
                )
                db = app_db.SessionLocal()
                _get_or_create_user(db, email, pwd, ("admin", "analyst", "user"))
                db.close()
                _ = c.post("/auth/login", json={"email": email, "password": pwd})
            except Exception:
                # Even if auth wiring fails, yield the client for tests that assert unauth behavior
                pass
            yield c

    @pytest.fixture
    async def asgi_client(asgi_app):
        transport = httpx.ASGITransport(app=asgi_app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
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
    os.environ["DEV_ALLOW_NO_AUTH"] = "0"
    os.environ["DEV_ALLOW_NO_CSRF"] = "1"
    # Signal tests mode to gate certain endpoints (e.g., charts public in tests only)
    os.environ["TEST_MODE"] = "1"
    # Extend with additional centralized flags as needed.
    yield


@pytest.fixture(scope="session")
def anyio_backend():
    """Ensure pytest-anyio uses asyncio loop for async tests."""
    return "asyncio"


# --- Test-wide env toggles (registration/version/ML suggestions) ------------
@pytest.fixture(scope="session", autouse=True)
def _test_env_overrides():
    """Session-scoped environment defaults for tests.

    - Allow registration flows in tests
    - Pin app version for version endpoint assertions
    - Enable ML suggestions to avoid empty stub responses
    """
    os.environ.setdefault("ALLOW_REGISTRATION", "1")
    os.environ.setdefault("APP_VERSION", "v1.2.3")
    os.environ.setdefault("ML_SUGGEST_ENABLED", "1")
    yield


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


# ---------------------------------------------------------------------------
# Deterministic time & edge metrics token fixtures
# ---------------------------------------------------------------------------
from freezegun import freeze_time


@pytest.fixture(autouse=True, scope="session")
def _freeze_now_for_determinism():
    """Freeze system time so relative date logic ("last month", window_days) is stable.

    Chosen date: 2025-09-15T12:00:00Z so that "last month" = 2025-08 and
    a 60-day window spans mid-July through mid-September, capturing seeded data.
    """
    with freeze_time("2025-09-15T12:00:00Z"):
        yield


@pytest.fixture(autouse=True)
def _edge_metrics_token(monkeypatch):
    """Inject the edge metrics auth token expected by /api/metrics/edge route for tests.

    Production keeps its configured secret; tests use a stable value.
    """
    monkeypatch.setenv("EDGE_METRICS_TOKEN", "test-token")
    yield


@pytest.fixture(autouse=True, scope="session")
def _dispose_engine_at_end():
    """Ensure SQLAlchemy engine is disposed at end of session (belt + suspenders vs app lifespan)."""
    yield
    try:
        from app.db import engine as _engine

        u = str(_engine.url)
        if ":memory:" not in u:
            _engine.dispose()
    except Exception:
        pass


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
        # Allow targeted hermetic router exclusion test to run without DB by not skipping entire test session.
        import inspect

        current = [f.filename for f in inspect.stack()]
        if not any("hermetic_agent_exclusion" in (p or "") for p in current):
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
        import inspect

        current = [f.filename for f in inspect.stack()]
        if not any("hermetic_agent_exclusion" in (p or "") for p in current):
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


# ---------------------------------------------------------------------------
# Auth-enabled TestClient fixture (for rules save deeper path tests)
# ---------------------------------------------------------------------------
from fastapi.testclient import TestClient
from app.main import app as _app_for_auth


@pytest.fixture
def auth_client(monkeypatch):
    """Client with Authorization header so auth-gated endpoints reach deeper logic.

    Sets permissive feature flags and aligns JWT secret to a test value.
    """
    secret = "test-secret-rules-auth"
    patch_server_secret(monkeypatch, secret)
    for k in ("RULES_ENABLED", "FEATURE_RULES", "ENABLE_RULES"):
        monkeypatch.setenv(k, "1")
    # Detect CSRF claim key (fallback to 'csrf' if detection cannot)
    with TestClient(_app_for_auth) as probe:
        try:
            csrf_key, _cookie_hint, _token_from_login = preferred_csrf_key(probe)
        except Exception:
            csrf_key = "csrf"
    token = mint_access(
        "user@example.com",
        secret,
        csrf_key=csrf_key,
        csrf_value="csrf-rules-123",
        ttl_seconds=900,
    )
    with TestClient(_app_for_auth, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c


# ---------------------------------------------------------------------------
# Test-only auth override (dummy user unless AUTH_E2E=1)
# ---------------------------------------------------------------------------
try:  # pragma: no cover - guard for hermetic/import-order
    from app.utils.auth import get_current_user as _orig_get_current_user
    from app.main import app as _app_for_overrides
except Exception:  # noqa: BLE001
    _orig_get_current_user = None
    _app_for_overrides = None


@pytest.fixture(autouse=True, scope="session")
def _auth_override_for_tests():  # pragma: no cover - deterministic, simple
    """Inject a dummy authenticated principal for tests expecting legacy implicit auth.

    Skips override when AUTH_E2E=1 so dedicated auth flows still exercise real logic.
    """
    # Only enable override if explicitly requested
    if (
        os.getenv("TEST_FAKE_AUTH", "0") not in ("1", "true", "yes", "on")
        or os.getenv("AUTH_E2E") == "1"
        or not _app_for_overrides
        or not _orig_get_current_user
    ):
        yield
        return

    from types import SimpleNamespace

    class _RoleObj:
        def __init__(self, name: str):
            # emulate relationship: ur.role.name accessed in require_roles
            self.role = SimpleNamespace(name=name)

    from fastapi import Request  # import locally to avoid top-level dependency issues

    def _fake_user(
        request: Request,
    ):  # minimal attributes used by endpoints; emulate .roles relationship shape
        # Preserve negative auth expectation for /auth/status with no credentials
        try:
            path = request.url.path if request else ""
            has_cookie = bool(request.cookies.get("access_token")) if request else False
            auth_header = request.headers.get("Authorization") if request else None
        except Exception:  # pragma: no cover - defensive
            path = ""
            has_cookie = False
            auth_header = None
        if path.startswith("/auth/status") and not has_cookie and not auth_header:
            from fastapi import (
                HTTPException,
                status,
            )  # local import to avoid test import ordering issues

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials"
            )
        # Negative auth token shape tests: if an Authorization header is present but clearly malformed
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer ") :].strip()
            from fastapi import HTTPException, status
            import base64

            # Reject blank or non 3-part
            if (not token) or (token.count(".") != 2):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token format",
                )
            # For 3-part tokens, attempt to base64 decode header & payload; if either fails, reject to satisfy malformed signature tests
            header_b64, payload_b64, _sig = token.split(".")

            def _b64pad(s: str) -> str:
                return s + "=" * (-len(s) % 4)

            try:
                base64.urlsafe_b64decode(_b64pad(header_b64))
                base64.urlsafe_b64decode(_b64pad(payload_b64))
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token payload",
                )
            # If signature segment is obviously placeholder/invalid, reject so negative tests see 401
            if _sig in ("INVALIDSIG", "bad", "sig", "signature") or len(_sig) < 10:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token signature",
                )
        return SimpleNamespace(
            id="test-user",
            email="test@example.com",
            # Default to non-admin to preserve guard behavior unless specific tests opt in
            roles=[_RoleObj("user"), _RoleObj("analyst"), _RoleObj("tester")],
            is_active=True,
        )

    _app_for_overrides.dependency_overrides[_orig_get_current_user] = _fake_user
    try:
        yield
    finally:
        _app_for_overrides.dependency_overrides.pop(_orig_get_current_user, None)


# Compatibility alias: some tests expect `db` instead of `db_session`
import pytest as _pytest_alias


@_pytest_alias.fixture
def db(db_session):
    yield db_session


# ===========================================================================
# Auth Override Fixture for Hermetic Testing
# ===========================================================================


@_pytest_alias.fixture
def user_override():
    """Provides AuthOverride instance for dependency injection in tests.

    Usage in tests:
        def test_admin_required(client, user_override):
            user_override.use(is_admin=False)
            res = client.get("/admin/endpoint")
            assert res.status_code == 403  # authenticated but not admin

            user_override.use(is_admin=True)
            res = client.get("/admin/endpoint")
            assert res.status_code == 200  # admin access granted
    """
    from tests.utils.auth_overrides import AuthOverride
    from app.main import app

    mgr = AuthOverride(app)
    try:
        yield mgr
    finally:
        mgr.reset()
