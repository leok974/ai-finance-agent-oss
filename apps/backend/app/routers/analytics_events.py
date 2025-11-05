from __future__ import annotations
from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, Optional
import time
import os
import logging
import json
import re
import asyncio

router = APIRouter(prefix="/analytics", tags=["analytics"])
log = logging.getLogger("analytics")

ANALYTICS_ENABLED = os.getenv("ANALYTICS_ENABLED", "1") not in ("0", "false", "False")
ANALYTICS_DB = os.getenv("ANALYTICS_DB", "0") in ("1", "true", "True")
MAX_PROPS_BYTES = int(os.getenv("ANALYTICS_MAX_PROPS", "4096"))  # 4 KiB


class TrackEvent(BaseModel):
    event: str = Field(min_length=1, max_length=64)
    props: Optional[Dict[str, Any]] = None
    ts: Optional[int] = None  # epoch ms

    @field_validator("event")
    @classmethod
    def event_chars(cls, v: str) -> str:
        # allow letters, numbers, dot, underscore, hyphen, colon
        if not re.fullmatch(r"[A-Za-z0-9._:-]+", v):
            raise ValueError("invalid_event_name")
        return v


def _props_size_ok(p: Optional[Dict[str, Any]]) -> bool:
    if not p:
        return True
    try:
        return (
            len(
                json.dumps(p, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            )
            <= MAX_PROPS_BYTES
        )
    except Exception:
        return False


@router.post("/track")
async def track(req: Request, body: TrackEvent):
    # Respect Do-Not-Track and global toggle
    if req.headers.get("DNT") == "1" or not ANALYTICS_ENABLED:
        return Response(status_code=204)

    if not _props_size_ok(body.props):
        raise HTTPException(status_code=413, detail="props_too_large")

    rid = getattr(req.state, "request_id", None) or req.headers.get("X-Request-ID")
    now_ms = int(time.time() * 1000)

    record: Dict[str, Any] = {
        "event": body.event,
        "props": body.props or {},
        "client_ts": body.ts,
        "server_ts": now_ms,
        "rid": rid,
        "path": str(req.url.path),
        "ip": req.headers.get("CF-Connecting-IP")
        or (req.client.host if req.client else None),
        "ua": req.headers.get("User-Agent"),
    }

    # Option A: log-only (default)
    try:
        log.info("track %s", json.dumps(record, ensure_ascii=False))
    except Exception:
        # Never block UI
        return Response(status_code=204)

    # Option B: DB sink (behind flag)
    if ANALYTICS_DB:
        try:
            # import lazily to avoid overhead if unused
            from app.services.analytics_sink import store_event  # sync function

            loop = asyncio.get_running_loop()
            # offload to default executor so we don't block the event loop
            loop.create_task(loop.run_in_executor(None, store_event, record))
        except Exception:
            # swallow to avoid surfacing errors
            pass

    return Response(status_code=204)


@router.post("/help_open")
async def help_open(req: Request, body: Dict[str, Any]):
    # Normalize to a track event
    ev = TrackEvent(event="help_open", props=body, ts=int(time.time() * 1000))
    return await track(req, ev)
