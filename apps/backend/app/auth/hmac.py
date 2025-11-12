"""
HMAC authentication for /agent/* endpoints.

Security model:
- Test modes (stub, echo) bypass auth for E2E testing
- Real modes require valid HMAC signature
- Replay protection via Redis (multi-worker safe)
- ±5 minute clock skew tolerance

Canonical string format: <METHOD>\n<PATH>\n<TIMESTAMP>\n<BODY_SHA256>
"""

import hashlib
import hmac
import logging
import time
from typing import Annotated

from fastapi import Header, HTTPException, Request
from app.config import settings
from app.utils.replay_cache import ReplayCacheProtocol, create_replay_cache
from app.metrics.agent import (
    agent_requests_total,
    agent_replay_attempts_total,
    agent_auth_skew_ms,
)

logger = logging.getLogger(__name__)

# Global replay cache (initialized on first use)
_replay_cache: ReplayCacheProtocol | None = None


def _get_replay_cache() -> ReplayCacheProtocol:
    """Lazy-init replay cache singleton."""
    global _replay_cache
    if _replay_cache is None:
        _replay_cache = create_replay_cache(
            settings.REDIS_URL, settings.REDIS_REPLAY_PREFIX
        )
    return _replay_cache


def _get_replay_cache() -> ReplayCacheProtocol:
    """Lazy-init replay cache singleton."""
    global _replay_cache
    if _replay_cache is None:
        _replay_cache = create_replay_cache(
            settings.REDIS_URL, settings.REDIS_REPLAY_PREFIX
        )
    return _replay_cache


def verify_hmac_auth(
    request: Request,
    x_client_id: Annotated[str | None, Header()] = None,
    x_timestamp: Annotated[str | None, Header()] = None,
    x_signature: Annotated[str | None, Header()] = None,
    x_test_mode: Annotated[str | None, Header()] = None,
) -> dict:
    """
    Verify HMAC authentication for /agent/* endpoints.

    Test modes (stub, echo) bypass auth.
    Real modes require valid HMAC-SHA256 signature.

    Returns:
        dict: {"client_id": str, "auth_mode": "bypass"|"hmac", "test_mode": str|None}

    Raises:
        HTTPException: 401/403/409 on auth failure
    """

    # Test modes bypass authentication (for E2E testing)
    if x_test_mode in ("stub", "echo"):
        logger.info(
            "[hmac] test mode bypass",
            extra={"test_mode": x_test_mode, "client_id": x_client_id or "anonymous"},
        )
        agent_requests_total.labels(auth="bypass", mode=x_test_mode).inc()
        return {
            "client_id": x_client_id or "test-anonymous",
            "auth_mode": "bypass",
            "test_mode": x_test_mode,
        }

    # Real modes require HMAC authentication
    if not x_client_id or not x_timestamp or not x_signature:
        logger.warning(
            "[hmac] missing required headers",
            extra={
                "has_client_id": bool(x_client_id),
                "has_timestamp": bool(x_timestamp),
                "has_signature": bool(x_signature),
            },
        )
        agent_requests_total.labels(auth="fail", mode="unknown").inc()
        raise HTTPException(
            status_code=401,
            detail="Missing authentication headers (X-Client-Id, X-Timestamp, X-Signature required)",
        )

    # Verify timestamp within ±5 minute window
    try:
        ts_ms = int(x_timestamp)
    except ValueError:
        logger.warning(f"[hmac] invalid timestamp format: {x_timestamp}")
        agent_requests_total.labels(auth="fail", mode="invalid_timestamp").inc()
        raise HTTPException(status_code=401, detail="Invalid timestamp format")

    now_ms = int(time.time() * 1000)
    skew_ms = abs(now_ms - ts_ms)
    max_skew_ms = 5 * 60 * 1000  # ±5 minutes

    # Record skew metric
    agent_auth_skew_ms.observe(skew_ms)

    if skew_ms > max_skew_ms:
        logger.warning(
            "[hmac] timestamp outside window",
            extra={
                "client_id": x_client_id,
                "skew_ms": skew_ms,
                "max_skew_ms": max_skew_ms,
            },
        )
        agent_requests_total.labels(auth="fail", mode="clock_skew").inc()
        raise HTTPException(
            status_code=408,
            detail=f"Timestamp outside ±5 minute window (skew: {skew_ms}ms)",
        )

    # Replay protection: reject duplicate timestamps from same client
    cache = _get_replay_cache()
    replay_key = f"{x_client_id}:{x_timestamp}"

    if not cache.check_and_set(replay_key, settings.REDIS_REPLAY_TTL):
        logger.warning(
            "[hmac] replay attempt detected",
            extra={"client_id": x_client_id, "timestamp": x_timestamp},
        )
        agent_replay_attempts_total.inc()
        agent_requests_total.labels(auth="fail", mode="replay").inc()
        raise HTTPException(
            status_code=409, detail="Duplicate request (replay protection)"
        )

    # Get shared secret from config
    if not settings.E2E_SESSION_HMAC_SECRET:
        logger.error("[hmac] E2E_SESSION_HMAC_SECRET not configured")
        agent_requests_total.labels(auth="fail", mode="config_error").inc()
        raise HTTPException(status_code=500, detail="Server misconfigured")

    # Read and hash request body
    # Note: FastAPI has already consumed the body for JSON parsing,
    # so we need to reconstruct it from the parsed request
    try:
        body_bytes = request._body  # type: ignore
    except AttributeError:
        # Fallback: re-serialize from JSON (may have formatting differences)
        import json

        body_bytes = (
            json.dumps(request.state.json_body, separators=(",", ":")).encode()
            if hasattr(request.state, "json_body")
            else b""
        )

    body_hash = hashlib.sha256(body_bytes).hexdigest()

    # Build canonical string
    method = request.method.upper()
    path = request.url.path
    canonical = f"{method}\n{path}\n{x_timestamp}\n{body_hash}"

    # Compute expected signature
    expected_sig = hmac.new(
        settings.E2E_SESSION_HMAC_SECRET.encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()

    # Constant-time comparison
    if not hmac.compare_digest(x_signature, expected_sig):
        # Redact signature in logs
        logger.warning(
            "[hmac] signature mismatch",
            extra={
                "client_id": x_client_id,
                "path": path,
                "skew_ms": skew_ms,
                "signature": "<redacted>",
            },
        )
        agent_requests_total.labels(auth="fail", mode="bad_signature").inc()
        raise HTTPException(status_code=403, detail="Invalid signature")

    logger.info(
        "[hmac] auth success",
        extra={
            "client_id": x_client_id,
            "path": path,
            "skew_ms": skew_ms,
            "auth_mode": "hmac",
        },
    )

    agent_requests_total.labels(auth="ok", mode="real").inc()

    return {
        "client_id": x_client_id,
        "auth_mode": "hmac",
        "test_mode": None,
        "skew_ms": skew_ms,
    }
