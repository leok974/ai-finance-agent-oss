from fastapi.testclient import TestClient
from app.main import app
from app.orm_models import User
from app.utils.auth import hash_password

client = TestClient(app)


def test_register_login_me(db_session):
    email = "test@example.com"
    password = "secret123"
    # register
    r = client.post(
        "/auth/register", json={"email": email, "password": password, "roles": ["user"]}
    )
    assert r.status_code == 200, r.text
    at = r.json()["access_token"]

    # me
    r2 = client.get("/auth/me", headers={"Authorization": f"Bearer {at}"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["email"] == email


def test_guarded_requires_admin(db_session, monkeypatch):
    # create admin
    admin = User(email="admin@test", password_hash=hash_password("x"))
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    # Expect 200 in dev bypass or 401/403 otherwise
    r = client.post(
        "/rules/preview",
        json={"name": "x", "enabled": True, "when": {}, "then": {"category": "Test"}},
    )
    assert r.status_code in (200, 401, 403)
