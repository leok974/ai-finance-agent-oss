import os
import time
import pytest
from fastapi import FastAPI, Depends, status
from fastapi.testclient import TestClient

from app.utils import auth as auth_utils
from app.orm_models import User

# NOTE: We rely on real hashing but use in-memory DB via existing session fixture (if provided by conftest)

# Helper to forge a token with custom exp and/or secret


def make_token(
    sub: str = "user@test",
    roles=None,
    exp_offset_seconds: int = 60,
    secret: str = None,
    issuer=None,
    audience=None,
):
    roles = roles or ["user"]
    now = int(time.time())
    payload = {
        "sub": sub,
        "roles": roles,
        "type": "access",
        "iat": now,
        "exp": now + exp_offset_seconds,
        "iss": issuer or os.getenv("AUTH_ISSUER", "finance-agent"),
        "aud": audience or os.getenv("AUTH_AUDIENCE", "finance-agent-app"),
    }
    secret = secret or os.getenv(
        "AUTH_SECRET", getattr(auth_utils.settings, "AUTH_SECRET", "dev-secret")
    )
    return auth_utils._sign_jwt(payload, secret)


def test_decode_token_expired(monkeypatch):
    # Create an already-expired token
    tok = make_token(exp_offset_seconds=-5)
    with pytest.raises(Exception) as exc:
        auth_utils.decode_token(tok)
    # FastAPI raises HTTPException with detail Token expired
    assert "expired" in str(exc.value).lower()


def test_decode_token_bad_signature(monkeypatch):
    tok = make_token()
    # Tamper last char
    tampered = tok[:-1] + ("A" if tok[-1] != "A" else "B")
    with pytest.raises(Exception) as exc:
        auth_utils.decode_token(tampered)
    assert "signature" in str(exc.value).lower()


def test_decode_token_bad_issuer(monkeypatch):
    tok = make_token(issuer="evil-issuer")
    with pytest.raises(Exception) as exc:
        auth_utils.decode_token(tok)
    assert "issuer" in str(exc.value).lower()


def test_decode_token_bad_audience(monkeypatch):
    tok = make_token(audience="wrong-aud")
    with pytest.raises(Exception) as exc:
        auth_utils.decode_token(tok)
    assert "audience" in str(exc.value).lower()


def test_get_current_user_missing_csrf_header(
    monkeypatch, db_session
):  # db_session assumed from existing test infra
    app = FastAPI()

    # Create a real user in DB
    u = User(email="csrf@test", password_hash=auth_utils.hash_password("pw"))
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)

    # Provide valid token
    token = make_token(sub=u.email)

    @app.get("/protected")
    def protected(user=Depends(auth_utils.get_current_user)):
        return {"email": user.email}

    client = TestClient(app)

    # Intentionally omit Authorization header to simulate missing credentials path -> expect 401
    r = client.get("/protected")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Missing" in r.text or "credential" in r.text

    # Provide bearer token (happy path) to ensure baseline works
    r2 = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["email"] == u.email
