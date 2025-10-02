from __future__ import annotations
import os
import time
import importlib
import base64
import hmac
import hashlib
import json
from typing import Dict, Optional, Tuple

CANDIDATE_LOGIN_ENDPOINTS = ("/api/auth/login", "/api/login", "/auth/login")
CANDIDATE_PAYLOADS = (
    lambda u, p: {"email": u, "password": p},
    lambda u, p: {"username": u, "password": p},
)
CANDIDATE_COOKIE_NAMES = ("access_token", "access", "jwt", "session")
CANDIDATE_CSRF_CLAIMS = ("csrf", "xsrf", "csrf_token", "csrfClaim", "X-CSRF-Token")
CANDIDATE_ENV_SECRETS = ("JWT_SECRET", "AUTH_SECRET", "SECRET_KEY", "APP_SECRET_KEY", "LM_JWT_SECRET")
CSRF_HEADER = "X-CSRF-Token"

# ----------------- JWT libs (PyJWT or python-jose) -----------------

def _jwt_lib():
    try:
        import jwt as pyjwt  # PyJWT
        return ("pyjwt", pyjwt)
    except Exception:
        try:
            from jose import jwt as jose_jwt
            return ("jose", jose_jwt)
        except Exception:
            return (None, None)


def jwt_encode(payload: dict, secret: str, alg: str = "HS256") -> str:
    name, lib = _jwt_lib()
    if not lib:
        # Provide a pure-Python HS256 fallback (mirrors minimal server strategy)
        if alg != "HS256":
            raise RuntimeError("Fallback signer only supports HS256 and no JWT lib installed")
        header = {"alg": alg, "typ": "JWT"}
        def _b64u(b: bytes) -> str:
            return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")
        h = _b64u(json.dumps(header, separators=(",", ":"), sort_keys=True).encode())
        p = _b64u(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
        msg = f"{h}.{p}".encode()
        sig = hmac.new(secret.encode(), msg, hashlib.sha256).digest()
        s = _b64u(sig)
        return f"{h}.{p}.{s}"
    if name == "pyjwt":
        token = lib.encode(payload, secret, algorithm=alg)
        return token.decode() if hasattr(token, "decode") else token
    return lib.encode(payload, secret, algorithm=alg)


def jwt_claims_unverified(token: str) -> Dict:
    name, lib = _jwt_lib()
    if not lib:
        # Minimal parse for fallback: split and decode payload only
        try:
            _h, p, _s = token.split('.')
            pad = '=' * (-len(p) % 4)
            raw = base64.urlsafe_b64decode(p + pad).decode('utf-8')
            return json.loads(raw)
        except Exception:
            return {}
    if name == "pyjwt":
        return lib.decode(token, options={"verify_signature": False, "verify_exp": False})
    return lib.get_unverified_claims(token)

# ----------------- Detection helpers -----------------

def detect_login(client) -> Optional[str]:
    """Return the first login endpoint that exists (OPTIONS/GET probe)."""
    for path in CANDIDATE_LOGIN_ENDPOINTS:
        r = client.options(path)
        if r.status_code != 404:
            return path
        r = client.get(path)
        if r.status_code != 404:
            return path
    return None


def try_login(client, username: str, password: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Attempt a login using common payload shapes.
    Returns (access_token or None, cookie_name or None).
    """
    path = detect_login(client)
    if not path:
        return (None, None)

    for build in CANDIDATE_PAYLOADS:
        r = client.post(path, json=build(username, password))
        if r.status_code in (200, 201, 202, 204, 302):
            # JSON token?
            try:
                body = r.json()
            except Exception:
                body = {}
            for k in ("access_token", "token", "jwt", "access"):
                tok = body.get(k)
                if isinstance(tok, str) and len(tok) > 20:
                    return (tok, _cookie_name_from_response(r))
            # Cookie token?
            cname = _cookie_name_from_response(r)
            if cname:
                tok = r.cookies.get(cname)
                if tok:
                    return (tok, cname)
            if r.is_redirect and "location" in r.headers:
                rr = client.get(r.headers["location"])
                cname = _cookie_name_from_response(rr)
                if cname:
                    tok = rr.cookies.get(cname)
                    if tok:
                        return (tok, cname)
    return (None, None)


def _cookie_name_from_response(resp) -> Optional[str]:
    for name in CANDIDATE_COOKIE_NAMES:
        if name in resp.cookies:
            return name
    sc = resp.headers.get("set-cookie") or ""
    for name in CANDIDATE_COOKIE_NAMES:
        if f"{name}=" in sc:
            return name
    return None


def detect_csrf_claim_from_token(token: str) -> Optional[str]:
    claims = jwt_claims_unverified(token) or {}
    for k in CANDIDATE_CSRF_CLAIMS:
        if k in claims:
            return k
    return None


def preferred_csrf_key(client) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Try to login (if creds exist) and infer the CSRF claim key + cookie name.
    Returns (csrf_key, cookie_name, token_from_login)
    """
    user = os.getenv("AUTH_USERNAME") or os.getenv("TEST_USERNAME")
    pwd = os.getenv("AUTH_PASSWORD") or os.getenv("TEST_PASSWORD")
    if not user or not pwd:
        return ("csrf", None, None)

    token, cookie_name = try_login(client, user, pwd)
    if not token:
        return ("csrf", cookie_name, None)

    claim = detect_csrf_claim_from_token(token) or "csrf"
    return (claim, cookie_name, token)

# ----------------- Server secret alignment (optional) -----------------

def patch_server_secret(monkeypatch, secret: str):
    for k in CANDIDATE_ENV_SECRETS:
        monkeypatch.setenv(k, secret)
    try:
        auth_mod = importlib.import_module("apps.backend.app.utils.auth")
        for attr in ("JWT_SECRET", "AUTH_SECRET", "SECRET_KEY", "APP_SECRET_KEY"):
            if hasattr(auth_mod, attr):
                monkeypatch.setattr(auth_mod, attr, secret, raising=False)
        for fn in ("get_jwt_secret", "get_secret", "jwt_secret"):
            if hasattr(auth_mod, fn):
                monkeypatch.setattr(auth_mod, fn, lambda: secret, raising=False)
        importlib.reload(auth_mod)
    except Exception:
        pass


def mint_access(sub: str, secret: str, csrf_key: str, csrf_value: str, ttl_seconds: int = 300) -> str:
    now = int(time.time())
    payload = {"sub": sub, "iat": now - 5, "exp": now + ttl_seconds, csrf_key: csrf_value, "type": "access"}
    return jwt_encode(payload, secret, alg="HS256")
