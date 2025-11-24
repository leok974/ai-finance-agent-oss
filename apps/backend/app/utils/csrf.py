import os
import secrets
import logging
from fastapi import Header, Request, HTTPException, status
from fastapi.responses import Response
from typing import Optional

# Reuse cookie settings from auth utils
from app.utils.auth import _cookie_secure, _cookie_samesite, _cookie_domain
from app.utils.env import is_test

logger = logging.getLogger(__name__)


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


def csrf_protect(
    request: Request,
    x_csrf_token: Optional[str] = Header(default=None, alias="X-CSRF-Token"),
):
    """Minimal double-submit-cookie CSRF protection.

    - Only enforced for unsafe methods (POST/PUT/PATCH/DELETE)
    - Allows specific auth routes which cannot have CSRF pre-login
    """
    # Test/dev bypass: allow disabling CSRF for hermetic tests, EXCEPT always enforce for /auth/refresh
    path = (request.url.path or "").lower()
    if path.startswith("/auth/refresh"):
        # Always enforce CSRF on refresh to prevent fixation/CSRF bypass in tests and dev
        pass
    else:
        if (
            os.getenv("DEV_ALLOW_NO_CSRF") in ("1", "true", "True", 1, True)
            or is_test()
        ):
            return

    method = request.method.upper()
    if method in _SAFE:
        return

    # Allowlist pre-login auth endpoints and health (no CSRF cookie present yet)
    # At this point, either we're enforcing globally or we're on a sensitive path (refresh)
    path = request.url.path or ""
    if (
        path.startswith("/auth/login")
        or path.startswith("/auth/register")
        or path.startswith("/auth/github/")
        or path.startswith("/auth/google/")
        or path in ("/health", "/healthz", "/ping")
    ):
        return

    cookie = request.cookies.get("csrf_token")

    # Enhanced logging for CSRF failures to aid debugging
    if not cookie:
        logger.warning(
            "CSRF check failed: no csrf_token cookie",
            extra={
                "path": path,
                "method": method,
                "has_header": bool(x_csrf_token),
                "client_ip": request.client.host if request.client else None,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF check failed: missing cookie",
        )

    if not x_csrf_token:
        logger.warning(
            "CSRF check failed: no X-CSRF-Token header",
            extra={
                "path": path,
                "method": method,
                "has_cookie": bool(cookie),
                "client_ip": request.client.host if request.client else None,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF check failed: missing header",
        )

    if x_csrf_token != cookie:
        logger.warning(
            "CSRF check failed: token mismatch",
            extra={
                "path": path,
                "method": method,
                "cookie_len": len(cookie),
                "header_len": len(x_csrf_token),
                "client_ip": request.client.host if request.client else None,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF check failed: token mismatch",
        )
