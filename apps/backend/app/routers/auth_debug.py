from fastapi import APIRouter, Request, Depends, HTTPException

try:
    from app.utils.auth import (
        get_current_user as require_authenticated_user,
    )  # reuse existing auth
except Exception:  # pragma: no cover

    def require_authenticated_user():  # type: ignore
        raise HTTPException(status_code=500, detail="auth not available")


router = APIRouter(prefix="/auth", tags=["auth-debug"])  # shares /auth namespace


@router.get("/debug")
async def auth_debug(request: Request, _user=Depends(require_authenticated_user)):
    """Protected debug endpoint echoing selected forwarded headers.

    DO NOT enable in production unless actively diagnosing proxy/header/cookie issues.
    Controlled via ENABLE_AUTH_DEBUG=1.
    Cookies are intentionally not echoed.
    """
    hdr = request.headers
    return {
        "url": str(request.url),
        "client": request.client.host if request.client else None,
        "host": hdr.get("host"),
        "xf_proto": hdr.get("x-forwarded-proto"),
        "xf_host": hdr.get("x-forwarded-host"),
        "xf_port": hdr.get("x-forwarded-port"),
    }
