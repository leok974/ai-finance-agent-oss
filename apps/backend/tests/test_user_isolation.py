"""
Test user data isolation - ensure users can only access their own data.

These tests verify that:
1. Users cannot see other users' transactions in list endpoints
2. Users cannot access other users' transactions by ID
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base, get_db
from app.orm_models import Transaction, User
from app.utils.auth import hash_password, create_tokens
from datetime import date


# Test database setup - completely isolated
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    """Create all tables for testing."""
    # Import app after setting up db override to avoid loading conftest fixtures
    from app.main import app as _app

    # Override the db dependency
    def override_get_db():
        try:
            db = TestingSessionLocal()
            yield db
        finally:
            db.close()

    _app.dependency_overrides[get_db] = override_get_db

    # Create only the tables we need
    User.__table__.create(bind=engine, checkfirst=True)
    Transaction.__table__.create(bind=engine, checkfirst=True)

    yield

    # Cleanup
    Base.metadata.drop_all(bind=engine)
    _app.dependency_overrides.clear()


@pytest.fixture
def db():
    """Create fresh database session for each test."""
    db = TestingSessionLocal()
    yield db
    # Clean up transactions and users after each test
    db.query(Transaction).delete()
    db.query(User).delete()
    db.commit()
    db.close()


@pytest.fixture
def user_a(db):
    """Create test user A."""
    user = User(
        email="user_a@test.com",
        password_hash=hash_password("password_a"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def user_b(db):
    """Create test user B."""
    user = User(
        email="user_b@test.com",
        password_hash=hash_password("password_b"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def client_a(user_a):
    """Create authenticated client for user A."""
    from app.main import app

    access_token, _ = create_tokens(user_a.email, ["user"])
    client = TestClient(app)
    client.cookies.set("access_token", access_token)
    return client


@pytest.fixture
def client_b(user_b):
    """Create authenticated client for user B."""
    from app.main import app

    access_token, _ = create_tokens(user_b.email, ["user"])
    client = TestClient(app)
    client.cookies.set("access_token", access_token)
    return client


def test_isolation_list(db, user_a, user_b, client_a):
    """User A cannot see User B's transactions in list endpoints."""
    # Seed: A has txn_A; B has txn_B
    txn_a = Transaction(
        id=1, user_id=user_a.id, date=date(2024, 1, 1), amount=100.0, month="2024-01"
    )
    txn_b = Transaction(
        id=2, user_id=user_b.id, date=date(2024, 1, 2), amount=200.0, month="2024-01"
    )
    db.add_all([txn_a, txn_b])
    db.commit()

    # User A calls list endpoint
    r = client_a.get("/transactions")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

    data = r.json()
    ids = {t["id"] for t in data}

    assert 1 in ids, "User A should see their own transaction (ID=1)"
    assert 2 not in ids, "User A should NOT see User B's transaction (ID=2)"


def test_isolation_by_id(db, user_a, user_b, client_a):
    """User A cannot access User B's transaction by ID."""
    # Seed: B has txn_B
    txn_b = Transaction(
        id=9, user_id=user_b.id, date=date(2024, 1, 1), amount=900.0, month="2024-01"
    )
    db.add(txn_b)
    db.commit()

    # User A tries to access B's transaction
    r = client_a.get("/transactions/9")
    assert r.status_code in (
        403,
        404,
    ), f"User A should not access User B's transaction. Got {r.status_code}"


def test_unauthenticated_blocked(db, user_a):
    """Unauthenticated requests to protected endpoints should be blocked."""
    from app.main import app

    # Seed a transaction
    txn = Transaction(
        id=1, user_id=user_a.id, date=date(2024, 1, 1), amount=100.0, month="2024-01"
    )
    db.add(txn)
    db.commit()

    # Try to access without auth
    client = TestClient(app)  # No cookies set
    r = client.get("/transactions")
    assert (
        r.status_code == 401
    ), f"Expected 401 for unauthenticated request, got {r.status_code}"
