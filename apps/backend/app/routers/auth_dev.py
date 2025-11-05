# apps/backend/app/routers/auth_dev.py
"""
Dev-only authentication endpoints for PIN-gated developer superuser unlock.
Only active in APP_ENV=dev. Completely disabled in production.
"""
from fastapi import APIRouter, Depends, Form, Request, Response, HTTPException, status
from app.utils.auth import get_current_user
from app.orm_models import User
from app.config import settings
import logging
from time import time
from collections import defaultdict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/dev", tags=["auth-dev"])

# In-memory bruteforce protection (dev-only)
# Key: f"{email}|{session_id or ip}"
# Value: {"n": attempt_count, "until": lockout_timestamp}
_unlock_attempts = defaultdict(lambda: {"n": 0, "until": 0})


def _throttle_key(request: Request, user_email: str) -> str:
    """
    Generate unique key for throttling based on session ID or client IP.
    Prevents bruteforce PIN guessing from same session/client.
    """
    # Prefer session ID if available (more accurate than IP)
    session_id = None
    if hasattr(request, "session"):
        session_id = request.session.get("_sid") or request.session.get("id")

    # Fallback to client IP
    client_ip = request.client.host if request.client else "0.0.0.0"

    return f"{user_email}|{session_id or client_ip}"


@router.post("/unlock")
def dev_unlock(
    request: Request,
    response: Response,
    pin: str = Form(...),
    user: User = Depends(get_current_user),
):
    """
    Unlock dev-only features by verifying PIN.

    Requires:
    - APP_ENV=dev
    - DEV_SUPERUSER_EMAIL and DEV_SUPERUSER_PIN configured
    - User logged in with matching email
    - Correct PIN provided

    Persists unlock state via:
    1. Session (preferred, if available)
    2. Dev-only cookie fallback (unsigned, 8h TTL)

    Also sets request.state.dev_unlocked and user.dev_unlocked flags.
    """
    # Check environment
    if settings.APP_ENV != "dev" and settings.ENV != "dev":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev unlock not available in production",
        )

    # Check configuration
    if not settings.DEV_SUPERUSER_EMAIL or not settings.DEV_SUPERUSER_PIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dev superuser not configured (missing EMAIL or PIN)",
        )

    # Check user email matches
    if user.email.lower() != settings.DEV_SUPERUSER_EMAIL.lower():
        logger.warning(
            f"🚫 SECURITY: Dev unlock denied | "
            f"user_id={user.id} email={user.email} reason=not_superuser"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized for dev unlock",
        )

    # Bruteforce protection (in-memory, dev-only)
    throttle_key = _throttle_key(request, user.email)
    attempt_record = _unlock_attempts[throttle_key]
    now = time()

    # Check if user is locked out
    if attempt_record["until"] > now:
        remaining = int(attempt_record["until"] - now)
        logger.warning(
            f"🚫 SECURITY: Dev unlock rate-limited | "
            f"user_id={user.id} email={user.email} "
            f"lockout_remaining={remaining}s attempts={attempt_record['n']}"
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {remaining} seconds.",
        )

    # Verify PIN
    if pin != settings.DEV_SUPERUSER_PIN:
        # Increment failure count
        attempt_record["n"] += 1
        logger.warning(
            f"🚫 SECURITY: Dev unlock failed | "
            f"user_id={user.id} email={user.email} reason=invalid_pin "
            f"attempts={attempt_record['n']}/{settings.DEV_UNLOCK_MAX_ATTEMPTS}"
        )

        # Lock out after max attempts
        if attempt_record["n"] >= settings.DEV_UNLOCK_MAX_ATTEMPTS:
            attempt_record["until"] = now + settings.DEV_UNLOCK_LOCKOUT_S
            attempt_record["n"] = 0  # Reset counter for next lockout period
            logger.warning(
                f"🚫 SECURITY: Dev unlock LOCKED OUT | "
                f"user_id={user.id} email={user.email} "
                f"lockout_duration={settings.DEV_UNLOCK_LOCKOUT_S}s"
            )

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid PIN")

    # Success - reset attempts
    _unlock_attempts.pop(throttle_key, None)
    logger.info(
        f"✅ SECURITY: Dev unlock SUCCESS | "
        f"user_id={user.id} email={user.email} throttle_cleared=true"
    )

    # Persist to session (preferred)
    if hasattr(request, "session"):
        request.session["dev_unlocked"] = True
        logger.debug("Dev unlock persisted to session")

    # Dev-only fallback cookie (unsigned; acceptable in dev environment)
    # 8-hour TTL, cleared on logout or browser restart with session cookie
    response.set_cookie(
        key="dev_unlocked",
        value="1",
        path="/",
        httponly=True,
        samesite="lax",
        secure=False if settings.APP_ENV == "dev" else True,
        max_age=8 * 60 * 60,  # 8 hours
    )
    logger.debug("Dev unlock persisted to cookie (8h TTL)")

    # Grant unlock for this request
    request.state.dev_unlocked = True
    user.dev_unlocked = True

    # Ensure admin role (runtime only, doesn't modify DB)
    user_roles = {ur.role.name for ur in (user.roles or [])}
    if "admin" not in user_roles:
        logger.info(
            f"✅ SECURITY: Runtime admin granted | "
            f"user_id={user.id} email={user.email}"
        )

    logger.info(
        f"✅ SECURITY: Dev mode UNLOCKED | " f"user_id={user.id} email={user.email}"
    )

    return {
        "ok": True,
        "message": "Dev mode unlocked",
        "dev_unlocked": True,
        "email": user.email,
    }


@router.post("/lock")
def dev_lock(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
):
    """
    Manually lock (disable) dev-only features.

    Clears unlock state from:
    - User object (current request)
    - Session storage
    - Cookie

    Useful for:
    - Manually re-locking after dev work
    - E2E testing unlock/lock cycles
    - Security: lock before stepping away
    """
    # Check environment (only available in dev)
    if settings.APP_ENV != "dev" and settings.ENV != "dev":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dev lock not available in production",
        )

    # Clear session
    if hasattr(request, "session"):
        request.session.pop("dev_unlocked", None)
        logger.debug("Dev unlock cleared from session")

    # Clear cookie
    response.delete_cookie("dev_unlocked", path="/", samesite="lax", httponly=True)
    logger.debug("Dev unlock cookie deleted")

    # Clear user attribute
    if hasattr(user, "dev_unlocked"):
        user.dev_unlocked = False

    logger.info(
        f"🔒 SECURITY: Dev mode LOCKED | " f"user_id={user.id} email={user.email}"
    )

    return {
        "ok": True,
        "message": "Dev mode locked",
        "dev_unlocked": False,
        "email": user.email,
    }


@router.get("/status")
def dev_status(
    request: Request,
    user: User = Depends(get_current_user),
):
    """
    Check dev unlock status for current user.

    Returns whether user is eligible for dev unlock and current unlock state.
    """
    # Check if in dev environment
    is_dev_env = settings.APP_ENV == "dev" or settings.ENV == "dev"

    # Check if user is the dev superuser
    is_superuser = (
        settings.DEV_SUPERUSER_EMAIL
        and user.email.lower() == settings.DEV_SUPERUSER_EMAIL.lower()
    )

    # Check current unlock state
    is_unlocked = getattr(user, "dev_unlocked", False)

    return {
        "env": settings.APP_ENV or settings.ENV,
        "is_dev_env": is_dev_env,
        "is_superuser": is_superuser,
        "dev_unlocked": is_unlocked,
        "pin_configured": bool(settings.DEV_SUPERUSER_PIN) if is_superuser else None,
    }
