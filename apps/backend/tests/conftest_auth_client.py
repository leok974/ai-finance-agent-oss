import pytest
from fastapi.testclient import TestClient
from apps.backend.app.main import app
from .helpers.auth_jwt import patch_server_secret, mint_access, preferred_csrf_key


@pytest.fixture
def auth_client(monkeypatch):
    """
    TestClient preloaded with Authorization: Bearer <valid>, so /agent/tools/rules/save
    won’t exit early on auth. Also sets permissive feature envs if present.
    """
    secret = "test-secret-rules-auth"
    patch_server_secret(monkeypatch, secret)

    for k in ("RULES_ENABLED", "FEATURE_RULES", "ENABLE_RULES"):
        monkeypatch.setenv(k, "1")

    # Detect CSRF claim key if login exists; otherwise default to "csrf"
    with TestClient(app) as probe:
        csrf_key, _cookie_hint, _token_from_login = preferred_csrf_key(probe)

    csrf_val = "csrf-rules-123"
    token = mint_access(
        "user@example.com",
        secret,
        csrf_key=csrf_key,
        csrf_value=csrf_val,
        ttl_seconds=600,
    )

    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c
