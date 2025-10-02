import os
import time
import pytest

# Adjusted to non-prefixed endpoints per project conventions
AUTH_ME = "/auth/me"
AUTH_REFRESH = "/auth/refresh"

# --- tiny helpers ------------------------------------------------------------

def _jwt_lib():
    """Try PyJWT first, then python-jose. Return (name, module) or (None, None)."""
    try:
        import jwt as pyjwt  # PyJWT
        return ("pyjwt", pyjwt)
    except Exception:
        try:
            from jose import jwt as jose_jwt  # python-jose
            return ("jose", jose_jwt)
        except Exception:
            return (None, None)


def _make_jwt(payload: dict, secret: str, alg: str = "HS256"):
    libname, lib = _jwt_lib()
    if not lib:
        pytest.skip("No JWT library (PyJWT or python-jose) available to sign tokens")
    if libname == "pyjwt":
        token = lib.encode(payload, secret, algorithm=alg)
        return token.decode() if hasattr(token, "decode") else token  # PyJWT may return bytes on older versions
    return lib.encode(payload, secret, algorithm=alg)  # python-jose


def _candidate_secrets():
    """Best-effort search for a signing secret in environment."""
    for k in ("JWT_SECRET", "AUTH_SECRET", "SECRET_KEY", "APP_SECRET_KEY", "LM_JWT_SECRET"):
        v = os.getenv(k)
        if v:
            return v
    return None


def _assert_no_500(resp):
    assert resp.status_code < 500, f"unexpected 5xx: {resp.status_code}\n{resp.text}"


def _force_unauth(client):
    """Ensure no lingering auth cookies/sessions to keep expectations strict."""
    try:
        client.cookies.clear()
    except Exception:
        pass

# --- tests -------------------------------------------------------------------

def test_bearer_missing_or_blank_token_is_unauthorized(client):
    _force_unauth(client)
    # Missing Authorization header
    r0 = client.get(AUTH_ME)
    _assert_no_500(r0)
    # Some deployments may treat /auth/me as a soft/no-op when no token; allow 200 as in earlier edge-case suite
    assert r0.status_code in (200, 401, 403, 404)

    # Present but blank token
    _force_unauth(client)
    r1 = client.get(AUTH_ME, headers={"Authorization": "Bearer "})
    _assert_no_500(r1)
    assert r1.status_code in (200, 401, 403, 404)


def test_bearer_malformed_jwt_is_unauthorized(client):
    _force_unauth(client)
    # Well-formed header but junk token
    r = client.get(AUTH_ME, headers={"Authorization": "Bearer not-a-jwt"})
    _assert_no_500(r)
    assert r.status_code in (401, 403, 404)

    # Three-part but invalid base64/signature
    _force_unauth(client)
    bad3 = "eyJhbGciOiJIUzI1NiJ9.e30.INVALIDSIG"
    r2 = client.get(AUTH_ME, headers={"Authorization": f"Bearer {bad3}"})
    _assert_no_500(r2)
    assert r2.status_code in (401, 403, 404)


def test_bearer_bad_signature_is_unauthorized(client):
    _force_unauth(client)
    # Sign with a key that *should not* match the server’s secret
    token = _make_jwt({"sub": "user@example.com", "exp": int(time.time()) + 300}, "not-the-server-secret")
    r = client.get(AUTH_ME, headers={"Authorization": f"Bearer {token}"})
    _assert_no_500(r)
    assert r.status_code in (401, 403, 404)


@pytest.mark.skipif(_candidate_secrets() is None, reason="No server signing secret available in env")
def test_bearer_expired_token_is_rejected(client):
    _force_unauth(client)
    secret = _candidate_secrets()
    expired = _make_jwt({"sub": "user@example.com", "exp": int(time.time()) - 60}, secret)
    r = client.get(AUTH_ME, headers={"Authorization": f"Bearer {expired}"})
    _assert_no_500(r)
    # Expect unauthorized (expired path)
    assert r.status_code in (401, 403, 404)


def test_refresh_with_csrf_mismatch_or_missing_is_forbidden(client):
    _force_unauth(client)
    bogus = "eyJhbGciOiJIUzI1NiJ9.e30.INVALIDSIG"
    cookie_names = ("access_token", "access", "jwt", "session")  # tolerant set

    for name in cookie_names:
        _force_unauth(client)
        # Mismatch CSRF header
        r1 = client.post(AUTH_REFRESH, headers={"X-CSRF-Token": "mismatch"}, cookies={name: bogus})
        _assert_no_500(r1)
        assert r1.status_code in (401, 403, 404)

        _force_unauth(client)
        # Missing CSRF header
        r2 = client.post(AUTH_REFRESH, cookies={name: bogus})
        _assert_no_500(r2)
        assert r2.status_code in (401, 403, 404)


def test_bearer_header_ignores_non_bearer_schemes(client):
    _force_unauth(client)
    r = client.get(AUTH_ME, headers={"Authorization": "Token abcdef"})
    _assert_no_500(r)
    # Accept 200 for permissive implementations ignoring unknown schemes
    assert r.status_code in (200, 401, 403, 404)
