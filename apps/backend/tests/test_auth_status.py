from fastapi.testclient import TestClient

from app.main import app
from app.utils.auth import create_tokens
from app.orm_models import User
from app.utils.auth import hash_password, _ensure_roles  # type: ignore

client = TestClient(app)


def test_auth_status_requires_cookie(db_session):
    # No cookie -> 401
    r = client.get("/auth/status")
    assert r.status_code == 401, r.text


def test_auth_status_with_cookie(db_session):
    # Create a user directly in the DB
    email = "status_user@example.com"
    user = User(email=email, password_hash=hash_password("pw"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    _ensure_roles(db_session, user, ["user"])  # ensure role mapping consistent

    # Mint tokens
    pair = create_tokens(email, roles=["user"])  # reuse existing helper

    # Manually set cookie on a response to capture attributes, then send request with cookie value only
    # FastAPI TestClient convenience: we can just pass cookies dict
    cookies = {"access_token": pair.access_token}

    r = client.get("/auth/status", cookies=cookies)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
