# tests/conftest.py
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]  # .../apps/backend
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
 # apps/backend/tests/conftest.py
import os
import sys
from pathlib import Path

# Make "apps/backend" importable as root so "app.*" works
ROOT = Path(__file__).resolve().parents[1]  # .../apps/backend
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db import Base, get_db
import app.db as app_db          # we'll monkeypatch this module's globals
from app import orm_models        # ensure models are registered with Base


@pytest.fixture(scope="session")
def _engine():
    # Single shared in-memory SQLite across threads (OK for TestClient)
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
    return sessionmaker(bind=_engine, autocommit=False, autoflush=False, future=True)


@pytest.fixture(autouse=True, scope="session")
def _force_sqlite_for_all_tests(_engine, _SessionLocal):
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


@pytest.fixture
def client(db_session):
    """FastAPI client that forces the app to use our db_session."""
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# --- ensure imports like "from app.transactions import Transaction" work ---
import sys as _sys
from pathlib import Path as _Path
import pytest

BACKEND_ROOT = _Path(__file__).resolve().parents[1]  # .../apps/backend
if str(BACKEND_ROOT) not in _sys.path:
    _sys.path.insert(0, str(BACKEND_ROOT))

@pytest.fixture
def db_session():
    """
    Yields a SQLAlchemy session bound to the same engine your app uses.
    The existing `client` fixture can use its own override; this is just
    for direct DB writes in tests (e.g., creating a Transaction row).
    """
    # Use module attribute so it picks up monkeypatch from _force_sqlite_for_all_tests
    db = app_db.SessionLocal()
    try:
        yield db
    finally:
        db.close()
