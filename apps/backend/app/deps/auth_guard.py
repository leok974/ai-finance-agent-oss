"""Auth guard dependency for protecting routes with OAuth session."""

from fastapi import Cookie, HTTPException
from app.auth.google import unsign_session_public


def require_session(lm_session: str = Cookie(default=None)):
    """
    FastAPI dependency that validates the lm_session cookie.

    Usage:
        from app.deps.auth_guard import require_session

        @router.get("/secure")
        def secure_endpoint(user = Depends(require_session)):
            return {"ok": True, "user": user}

    Raises:
        HTTPException: 401 if session is missing or invalid

    Returns:
        dict: User info from signed session token
            {
                "sub": "google_user_id",
                "email": "user@example.com",
                "name": "User Name",
                "picture": "https://...",
                "iss": "google"
            }
    """
    if not lm_session:
        raise HTTPException(401, "No session")
    try:
        return unsign_session_public(lm_session)
    except Exception:
        raise HTTPException(401, "Invalid session")
