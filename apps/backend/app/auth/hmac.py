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
    Unified auth dependency for /agent/* endpoints.

    Priority:
      1) Test modes via X-Test-Mode (stub/echo etc.) - bypass for E2E testing
      2) HMAC headers (X-Client-Id / X-Timestamp / X-Signature) - for E2E/programmatic access
      3) Cookie-based access_token - for user-facing frontend requests

    Returns:
        dict: {"client_id": str, "auth_mode": "bypass"|"hmac"|"cookie", "test_mode": str|None}

    Raises:
        HTTPException: 401/403/409 on auth failure
    """

    # 1) Test modes bypass authentication (for E2E testing)
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

    # 2) HMAC authentication (for E2E tests and programmatic access)
    if x_client_id and x_timestamp and x_signature:
        # Verify timestamp within ±5 minute window
        try:
            ts_ms = int(x_timestamp)
        except ValueError:
            logger.warning(f"[hmac] invalid timestamp format: {x_timestamp}")
            agent_requests_total.labels(auth="fail", mode="invalid_timestamp").inc()
            # Don't raise immediately - allow cookie fallback below
            ts_ms = None

        if ts_ms is not None:
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
                # Don't raise immediately - allow cookie fallback below
            else:
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
                try:
                    body_bytes = request._body  # type: ignore
                except AttributeError:
                    # Fallback: re-serialize from JSON
                    import json

                    body_bytes = (
                        json.dumps(
                            request.state.json_body, separators=(",", ":")
                        ).encode()
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
                    settings.E2E_SESSION_HMAC_SECRET.encode(),
                    canonical.encode(),
                    hashlib.sha256,
                ).hexdigest()

                # Constant-time comparison
                if hmac.compare_digest(x_signature, expected_sig):
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
                else:
                    logger.warning(
                        "[hmac] signature mismatch, trying cookie fallback",
                        extra={
                            "client_id": x_client_id,
                            "path": path,
                            "skew_ms": skew_ms,
                        },
                    )
                    # Don't raise - allow cookie fallback below

    # 3) Cookie-based authentication (for user-facing frontend requests)
    access_token = request.cookies.get("access_token")
    if access_token:
        try:
            from app.utils.auth import decode_token

            payload = decode_token(access_token)
            user_id = payload.get("sub") or payload.get("user_id")
            if not user_id:
                raise ValueError("No user identifier in token payload")

            logger.info(
                "[hmac] cookie auth success",
                extra={
                    "client_id": str(user_id),
                    "auth_mode": "cookie",
                },
            )
            agent_requests_total.labels(auth="ok", mode="cookie").inc()
            return {
                "client_id": str(user_id),
                "auth_mode": "cookie",
                "test_mode": None,
            }
        except Exception as exc:
            logger.debug("[hmac] cookie auth failed", exc_info=exc)
            # Fall through to 401 below

    # 4) No valid authentication found
    logger.warning(
        "[hmac] no valid authentication",
        extra={
            "has_hmac_headers": bool(x_client_id and x_timestamp and x_signature),
            "has_cookie": bool(access_token),
        },
    )
    agent_requests_total.labels(auth="fail", mode="no_auth").inc()
    raise HTTPException(
        status_code=401,
        detail="Authentication required (HMAC headers or access_token cookie)",
    )
