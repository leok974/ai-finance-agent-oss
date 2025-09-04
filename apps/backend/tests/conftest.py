# apps/backend/tests/conftest.py
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db import Base
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


@pytest.fixture(scope="function")
def client(_SessionLocal):
    """
    Per-test TestClient. Even tests that don't use this fixture will still run
    against SQLite due to the autouse override above.
    """
    with TestClient(app) as c:
        yield c
