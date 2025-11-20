"""
E2E session mint endpoint.

Creates authenticated sessions for automated E2E tests without manual OAuth flow.

SECURITY:
- Only enabled when E2E_SESSION_ENABLED=1
- Requires HMAC signature with shared secret
- Short-lived (120s window for replay prevention)
- Audit logged
- Optionally gated by Cloudflare Access service token
"""

import hmac
import logging
import time
from typing import Annotated

from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import settings
from app.auth.session import issue_session_for_user
from app.utils.auth import set_auth_cookies
from app.utils.csrf import issue_csrf_cookie

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/e2e", tags=["e2e"])


class E2ESessionRequest(BaseModel):
    """Request body for session mint."""

    user: str = "e2e@ledgermind.org"


@router.post("/session")
async def mint_e2e_session(
    request: Request,
    body: E2ESessionRequest,
    x_e2e_sig: Annotated[str | None, Header()] = None,
    x_e2e_ts: Annotated[str | None, Header()] = None,
) -> JSONResponse:
    """
    Mint an authenticated session for E2E tests.

    Requires:
    - E2E_SESSION_ENABLED=1 in environment
    - x-e2e-ts: unix timestamp (±120s tolerance)
    - x-e2e-sig: HMAC-SHA256(user.ts, E2E_SESSION_HMAC_SECRET)

    Returns:
    - Set-Cookie: session (HttpOnly, Secure, SameSite=Lax)
    - JSON: {"ok": true, "user": "..."}
    """
    # Guard: feature flag
    if not settings.E2E_SESSION_ENABLED:
        logger.warning("[e2e] session mint attempted but E2E_SESSION_ENABLED=0")
        raise HTTPException(status_code=404, detail="Not found")

    # Guard: required headers
    if not x_e2e_sig or not x_e2e_ts:
        logger.warning("[e2e] session mint missing x-e2e-sig or x-e2e-ts headers")
        raise HTTPException(status_code=401, detail="Missing auth headers")

    # Guard: timestamp freshness (±120s)
    try:
        ts = int(x_e2e_ts)
    except ValueError:
        logger.warning(f"[e2e] invalid timestamp: {x_e2e_ts}")
        raise HTTPException(status_code=401, detail="Invalid timestamp")

    now = int(time.time())
    if abs(now - ts) > 120:
        logger.warning(
            f"[e2e] timestamp expired: {ts} vs {now} (diff={abs(now - ts)}s)"
        )
        raise HTTPException(status_code=401, detail="Timestamp expired")

    # Guard: HMAC signature
    if not settings.E2E_SESSION_HMAC_SECRET:
        logger.error("[e2e] E2E_SESSION_HMAC_SECRET not configured")
        raise HTTPException(status_code=500, detail="Server misconfigured")

    msg = f"{body.user}.{ts}".encode()
    expected_sig = hmac.new(
        settings.E2E_SESSION_HMAC_SECRET.encode(), msg, "sha256"
    ).hexdigest()

    if not hmac.compare_digest(x_e2e_sig, expected_sig):
        logger.warning(f"[e2e] invalid HMAC for user={body.user} ts={ts}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Optional: Cloudflare Access service token validation
    # cf_client_id = request.headers.get("CF-Access-Client-Id")
    # cf_client_secret = request.headers.get("CF-Access-Client-Secret")
    # if settings.CF_ACCESS_REQUIRED and (not cf_client_id or not cf_client_secret):
    #     raise HTTPException(status_code=401, detail="CF Access required")

    # Issue session (reuse OAuth callback logic)
    try:
        token_pair = issue_session_for_user(
            email=body.user,
            reason="e2e-test",
            max_age=3600,  # 1 hour TTL for test sessions
        )
    except Exception as e:
        logger.error(f"[e2e] failed to issue session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Session creation failed")

    # Audit log
    logger.info(
        "[e2e] session minted",
        extra={
            "user": body.user,
            "timestamp": ts,
            "user_agent": request.headers.get("user-agent"),
            "cf_ray": request.headers.get("cf-ray"),
            "ip": request.client.host if request.client else None,
        },
    )

    # Set cookie and return success
    resp = JSONResponse({"ok": True, "user": body.user})
    set_auth_cookies(resp, token_pair)
    issue_csrf_cookie(resp)  # Add CSRF cookie for authenticated requests

    return resp
