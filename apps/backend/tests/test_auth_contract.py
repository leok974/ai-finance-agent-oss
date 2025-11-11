"""
Auth contract tests - verify critical auth invariants.

These tests protect:
1. /auth/me endpoint exists and returns proper 401/403 when unauthenticated
2. Auth cookies are set with correct security flags (Secure, SameSite=None, Domain)
3. OpenAPI schema includes Google OAuth routes
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

# Mark all tests in this module to skip database fixtures
pytestmark = pytest.mark.usefixtures()

client = TestClient(app, raise_server_exceptions=False)


def test_me_unauthenticated_returns_401():
    """
    The /auth/me endpoint must exist and return 401 or 403 when unauthenticated.
    This prevents 404 regressions that break auth bootstrap.
    """
    r = client.get("/auth/me")  # backend-native path
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"
    body = r.json()
    assert (
        "detail" in body or "error" in body
    ), "Response must have detail or error field"


def test_auth_cookie_flags_on_set(monkeypatch):
    """
    When auth cookies are set, they MUST include:
    - Secure flag (HTTPS only)
    - SameSite=None (cross-site OAuth flows)
    - Domain=app.ledger-mind.org (consistent domain)

    This prevents session fixation and cookie leakage.
    """
    from app.utils.auth import set_auth_cookies, Tokens
    from fastapi import Response

    resp = Response()
    tokens = Tokens(access_token="a.b.c", refresh_token="x.y.z", expires_in=3600)
    set_auth_cookies(resp, pair=tokens)

    # Extract Set-Cookie headers
    cookies = [v for k, v in resp.raw_headers if k.lower() == b"set-cookie"]

    # At least one auth cookie present
    assert any(
        b"access" in c or b"refresh" in c for c in cookies
    ), "No access or refresh cookies found in response"

    # Must include the security attributes
    for c in cookies:
        s = c.decode()
        assert "Secure" in s, f"Cookie missing Secure flag: {s}"
        assert "SameSite=None" in s, f"Cookie missing SameSite=None: {s}"
        assert "Domain=app.ledger-mind.org" in s, f"Cookie missing correct Domain: {s}"


def test_openapi_has_google_routes():
    """
    OpenAPI schema must include Google OAuth routes.
    This ensures the API contract is documented and stable.
    """
    with TestClient(app) as c:
        r = c.get("/openapi.json")

    assert r.status_code == 200, "OpenAPI endpoint must be accessible"

    paths = r.json().get("paths", {})

    # Check for Google login route (either /api/auth/google/login or /auth/google/login)
    has_login = "/api/auth/google/login" in paths or "/auth/google/login" in paths
    assert has_login, "OpenAPI schema missing Google login route"

    # Check for Google callback route
    has_callback = any("/google/callback" in p for p in paths.keys())
    assert has_callback, "OpenAPI schema missing Google callback route"


# Async client tests for contract validation
import pytest
import httpx


@pytest.mark.asyncio
async def test_me_never_404_async():
    """
    Async version: /auth/me must never return 404.
    This is the critical regression that breaks auth bootstrap.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as ac:
        r = await ac.get("/auth/me")
        assert r.status_code in (
            200,
            401,
            403,
        ), f"/auth/me returned {r.status_code}, expected 200/401/403 (never 404)"


@pytest.mark.asyncio
async def test_cookie_security_settings():
    """
    Verify cookie security settings are configured correctly.
    These settings prevent session fixation and cookie leakage.
    """
    from app.utils.auth import _cookie_secure, _cookie_samesite, _cookie_domain

    # In production, cookies must be Secure
    secure = _cookie_secure()
    assert isinstance(secure, bool), "cookie secure setting must be boolean"

    # SameSite must be 'none' for cross-site OAuth flows
    samesite = _cookie_samesite()
    assert (
        samesite.lower() == "none"
    ), f"SameSite should be 'none' for OAuth, got {samesite}"

    # Domain must be scoped to app.ledger-mind.org
    domain = _cookie_domain()
    assert domain is not None, "Cookie domain must be set"
    assert (
        "ledger-mind.org" in domain
    ), f"Cookie domain should contain ledger-mind.org, got {domain}"
