import secrets
from fastapi import Header, Request, HTTPException, status
from fastapi.responses import Response
from typing import Optional

# Reuse cookie settings from auth utils
from app.utils.auth import _cookie_secure, _cookie_samesite, _cookie_domain


def issue_csrf_cookie(response: Response, max_age_seconds: int = 60 * 60 * 8) -> str:
    """Generate a CSRF token and set it as a non-HttpOnly cookie.

    The token is returned so callers can additionally return it in bodies if desired.
    """
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        "csrf_token",
        token,
        max_age=max_age_seconds,
        httponly=False,  # must be readable by JS to echo in header
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),
        path="/",
        domain=_cookie_domain(),
    )
    return token


_SAFE = {"GET", "HEAD", "OPTIONS"}


def csrf_protect(request: Request, x_csrf_token: Optional[str] = Header(default=None, alias="X-CSRF-Token")):
    """Minimal double-submit-cookie CSRF protection.

    - Only enforced for unsafe methods (POST/PUT/PATCH/DELETE)
    - Allows specific auth routes which cannot have CSRF pre-login
    """
    method = request.method.upper()
    if method in _SAFE:
        return

    # Allowlist pre-login auth endpoints and health (no CSRF cookie present yet)
    path = request.url.path or ""
    if path.startswith("/auth/login") or path.startswith("/auth/register") or \
       path.startswith("/auth/github/") or path.startswith("/auth/google/") or \
       path in ("/health", "/healthz", "/ping"):
        return

    cookie = request.cookies.get("csrf_token")
    if not cookie or not x_csrf_token or x_csrf_token != cookie:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF check failed")
