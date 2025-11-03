"""
Dev Overlay Router

Provides secure enable/disable/status endpoints for the frontend dev overlay.
Uses HMAC-signed cookies to prevent tampering.
"""

import os
import hmac
import hashlib
import time
from fastapi import APIRouter, Request, Response, HTTPException

router = APIRouter(prefix="/agent/dev", tags=["dev-overlay"])

COOKIE_NAME = "sa_dev"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "1") == "1"
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", "")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").capitalize()
COOKIE_MAX_AGE = 60 * 60 * 24 * 14  # 14 days

DEV_ENABLE_TOKEN = os.getenv("SITEAGENT_DEV_ENABLE_TOKEN", "dev")
SIGNING_KEY = os.getenv("SITEAGENT_DEV_COOKIE_KEY", "")


def _sign(val: str) -> str:
    """Sign value with HMAC-SHA256. Returns empty string if no signing key."""
    if not SIGNING_KEY:
        return ""
    mac = hmac.new(
        SIGNING_KEY.encode("utf-8"), val.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return mac


def _make_cookie_value(enabled: bool) -> str:
    """
    Create signed cookie value: '1.<timestamp>.<signature>' or '0.<timestamp>.<signature>'
    If no signing key, returns just '1' or '0'.
    """
    ts = str(int(time.time()))
    val = f"{'1' if enabled else '0'}.{ts}"
    sig = _sign(val)
    return f"{val}.{sig}" if sig else ("1" if enabled else "0")


def _verify_cookie(raw: str) -> bool:
    """
    Verify signed cookie. Returns True if valid and enabled=1.
    If no signing key, just check if raw == "1".
    """
    if not SIGNING_KEY:
        return raw == "1"

    # Split: "1.timestamp.signature"
    try:
        val, sig = raw.rsplit(".", 1)
    except ValueError:
        return False

    # Verify HMAC
    if not hmac.compare_digest(_sign(val), sig):
        return False

    # Check enabled flag
    try:
        enabled_flag = val.split(".", 1)[0]
        return enabled_flag == "1"
    except (IndexError, ValueError):
        return False


def _set_cookie(response: Response, value: str):
    """Set cookie with configured domain/secure/samesite settings."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=value,
        max_age=COOKIE_MAX_AGE,
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN if COOKIE_DOMAIN else None,
    )


def _del_cookie(response: Response):
    """Delete cookie."""
    response.delete_cookie(
        key=COOKIE_NAME,
        domain=COOKIE_DOMAIN if COOKIE_DOMAIN else None,
    )


@router.get("/status")
def get_status(request: Request):
    """
    Returns current dev overlay status based on cookie.
    Returns: {"enabled": bool, "cookie_present": bool}
    """
    raw = request.cookies.get(COOKIE_NAME, "")
    enabled = _verify_cookie(raw) if raw else False
    return {"enabled": enabled, "cookie_present": bool(raw)}


@router.get("/enable")
def enable_overlay(request: Request, response: Response):
    """
    Enable dev overlay by setting signed cookie.
    Requires Authorization header: Bearer <token>
    Returns: {"ok": true, "enabled": true}
    """
    # Check Authorization header
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = auth.split(" ", 1)[1]
    if token != DEV_ENABLE_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")

    # Set signed cookie
    cookie_val = _make_cookie_value(True)
    _set_cookie(response, cookie_val)

    return {"ok": True, "enabled": True}


@router.get("/disable")
def disable_overlay(response: Response):
    """
    Disable dev overlay by clearing cookie.
    Returns: {"ok": true, "enabled": false}
    """
    _del_cookie(response)
    return {"ok": True, "enabled": False}
