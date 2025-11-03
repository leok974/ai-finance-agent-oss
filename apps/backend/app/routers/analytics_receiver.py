from __future__ import annotations
from typing import Any, Optional
from fastapi import APIRouter, Request, Response, HTTPException
import os
import json
import time
import shutil
import re
import logging
from pydantic import BaseModel, Field, constr

try:  # Prometheus optional
    from prometheus_client import Counter, Histogram  # type: ignore
except Exception:  # pragma: no cover
    Counter = Histogram = None  # type: ignore

router = APIRouter(prefix="/agent/analytics", tags=["analytics-events"])
compat_router = APIRouter(tags=["analytics-events-compat"])

if Counter is not None:
    analytics_events_total = Counter("analytics_events_total", "Total analytics events received", ["event"])  # type: ignore
    scrubbed_fields_total = Counter("analytics_scrubbed_fields_total", "Total sensitive fields redacted or masked")  # type: ignore
else:  # type: ignore
    analytics_events_total = None  # type: ignore
    scrubbed_fields_total = None  # type: ignore

if Histogram is not None:
    analytics_event_size_bytes = Histogram(
        "analytics_event_size_bytes",
        "Size of analytics events in bytes",
        buckets=(64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 65536),
    )  # type: ignore
else:  # type: ignore
    analytics_event_size_bytes = None  # type: ignore


class AnalyticsEnvelope(BaseModel):
    event: constr(strip_whitespace=True, min_length=1, max_length=128)  # type: ignore
    ts: Optional[int] = Field(None, description="client epoch ms")
    props: dict[str, Any] = Field(default_factory=dict)


MAX_BYTES = 16 * 1024  # 16 KiB hard cap
# JSONL path/max bytes looked up dynamically each write to allow tests to set env after import.

# --- PII scrub configuration ---
_DEFAULT_SENSITIVE = (
    "email, authorization, token, access_token, refresh_token, id_token, "
    "apikey, api_key, key, secret, password, passwd, auth, session, cookie, "
    "ssn, social_security, creditcard, card, card_number, pan"
)
_SENSITIVE_KEYS = tuple(
    [
        s.strip().lower()
        for s in os.getenv("ANALYTICS_SENSITIVE_KEYS", _DEFAULT_SENSITIVE)
        .replace(";", ",")
        .split(",")
        if s.strip()
    ]
)
_RE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_RE_JWT = re.compile(r"^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$")
_RE_BEARER = re.compile(r"^(?:bearer\s+)?[A-Za-z0-9\-_=]{16,}$", re.I)
_MAX_STR_LEN = int(os.getenv("ANALYTICS_PROP_MAX_STRLEN", "512"))
_MAX_DEPTH = int(os.getenv("ANALYTICS_PROP_MAX_DEPTH", "6"))


def _is_sensitive_key(key: str) -> bool:
    k = (key or "").lower()
    return any(frag in k for frag in _SENSITIVE_KEYS)


def _mask_string_value(v: str) -> str:
    if _RE_EMAIL.match(v):
        return "[email]"
    if _RE_JWT.match(v):
        return "[jwt]"
    if _RE_BEARER.match(v):
        return "[token]"
    if len(v) > _MAX_STR_LEN:
        return v[:_MAX_STR_LEN] + "…"
    return v


def _scrub_props(obj, depth: int = 0):  # type: ignore
    if depth >= _MAX_DEPTH:
        return "[truncated]"
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if _is_sensitive_key(str(k)):
                out[k] = "[redacted]"
                try:
                    if scrubbed_fields_total is not None:  # type: ignore
                        scrubbed_fields_total.inc()  # type: ignore
                except Exception:
                    pass
            else:
                out[k] = _scrub_props(v, depth + 1)
        return out
    if isinstance(obj, list):
        redacted_list = []
        for x in obj:
            redacted_list.append(_scrub_props(x, depth + 1))
        return redacted_list
    if isinstance(obj, tuple):
        return tuple(_scrub_props(x, depth + 1) for x in obj)
    if isinstance(obj, str):
        masked = _mask_string_value(obj)
        if masked != obj:
            try:
                if scrubbed_fields_total is not None:  # type: ignore
                    scrubbed_fields_total.inc()  # type: ignore
            except Exception:
                pass
        return masked
    return obj


_JSONL_DEBUG = os.getenv("ANALYTICS_JSONL_DEBUG") == "1"
_LOGGER = logging.getLogger(__name__)


def _maybe_write_jsonl(obj: dict):  # best-effort persistence
    path = os.getenv("ANALYTICS_JSONL_PATH")
    if not path:
        if _JSONL_DEBUG:
            _LOGGER.warning(
                "analytics: JSONL sink disabled (ANALYTICS_JSONL_PATH not set)"
            )
        return
    try:
        max_bytes = int(os.getenv("ANALYTICS_JSONL_MAX_BYTES", "10485760"))
    except Exception:
        max_bytes = 10485760
    try:
        line = json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n"
        if os.path.exists(path) and (os.path.getsize(path) + len(line)) > max_bytes:
            ts = time.strftime("%Y%m%d-%H%M%S")
            try:
                shutil.move(path, f"{path}.{ts}.rotated")
            except Exception as e:
                if _JSONL_DEBUG:
                    _LOGGER.warning("analytics: rotation failed: %s", e)
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line)
    except Exception as e:
        if _JSONL_DEBUG:
            _LOGGER.warning("analytics: JSONL write failed: %s", e)
        return


@router.post("/event", status_code=204)
async def emit(
    ev: AnalyticsEnvelope, request: Request
) -> Response:  # pragma: no cover - simple passthrough
    # Reject if declared Content-Length exceeds cap (defense-in-depth; FastAPI already parsed body)
    try:
        cl_header = request.headers.get("content-length")
        if cl_header:
            cl = int(cl_header)
            if cl > MAX_BYTES:
                raise HTTPException(status_code=413, detail="payload too large")
    except ValueError:
        pass
    # metrics (best-effort)
    try:
        if analytics_events_total is not None:
            analytics_events_total.labels(ev.event).inc()  # type: ignore
        if analytics_event_size_bytes is not None:
            payload_len = len(ev.model_dump_json())
            analytics_event_size_bytes.observe(payload_len)  # type: ignore
    except Exception:
        pass
    # Scrub PII before any persistence
    try:
        safe_props = _scrub_props(ev.props)
    except Exception:
        safe_props = {}
    _maybe_write_jsonl(
        {
            "event": ev.event,
            "ts": ev.ts,
            "props": safe_props,
            "ip": request.client.host if request.client else None,
            "ua": request.headers.get("user-agent"),
            "srv_ts": int(time.time() * 1000),
        }
    )
    return Response(status_code=204)


@compat_router.post("/api/analytics/event", status_code=204)
async def emit_compat(
    ev: AnalyticsEnvelope, request: Request
) -> Response:  # pragma: no cover
    return await emit(ev, request)
