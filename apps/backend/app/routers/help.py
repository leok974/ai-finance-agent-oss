from __future__ import annotations

"""Unified Help endpoint providing deterministic 'what' and LLM (with fallback) 'why'.

Behavior:
- POST /help with JSON body {card_id, mode, month, deterministic_ctx, base_text?}
- Cache key includes: card_id, mode, month, REPHRASE_VERSION, MODEL_TAG, fingerprint(ctx+base_text for why)
- 24h TTL (configurable via HELP_TTL_SECONDS)
- Returns 304 when If-None-Match matches current ETag and not expired
- Never 500 for expected LLM failures: falls back deterministically
"""
import hashlib
import json
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse
from sqlalchemy import select, update, insert
from sqlalchemy.orm import Session

from app.db import get_db
from app.orm_models import HelpCache
from app.utils.llm import call_local_llm

router = APIRouter(prefix="/help", tags=["help"])

HELP_TTL_SECONDS = int(os.getenv("HELP_TTL_SECONDS", "86400"))  # 24h default
REPHRASE_VERSION = os.getenv("REPHRASE_VERSION", "v1")
MODEL_TAG = os.getenv("PRIMARY_MODEL_TAG", os.getenv("DEFAULT_LLM_MODEL", "model"))


class HelpReq(BaseModel):
    card_id: str = Field(min_length=1, max_length=128)
    mode: str  # "what" | "why"
    month: Optional[str] = None
    deterministic_ctx: Dict[str, Any]
    base_text: Optional[str] = None  # required when mode == why


class _CardPurpose:
    MAP = {
        "overview": "Shows total spend and month deltas; click to drill into categories and trends.",
        "top_categories": "Ranks categories by spend; tap a bar to open the trend chart.",
        "top_merchants": "Lists merchants by spend; use the CTA for What-If or to set a rule.",
    }

    @classmethod
    def what(cls, cid: str) -> str:
        return cls.MAP.get(cid, "Explains what this card displays and how to use it.")


def _fingerprint(ctx: Dict[str, Any], base: Optional[str]) -> str:
    h = hashlib.sha256()
    try:
        h.update(json.dumps(ctx, sort_keys=True, separators=(",", ":")).encode())
    except Exception:
        # fall back to repr if JSON fails (should be rare; context should be JSON-able)
        h.update(repr(ctx).encode())
    if base:
        h.update(b"|")
        h.update(base.encode())
    return h.hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _build_key(req: HelpReq, fp: str) -> str:
    month = req.month or "na"
    return f"{req.card_id}:{req.mode}:{month}:{REPHRASE_VERSION}:{MODEL_TAG}:{fp}"


def _deterministic_why_fallback(base: str) -> str:
    return f"{base} (Explained without AI due to a temporary model issue.)"


def _cache_lookup(db: Session, key: str) -> Optional[HelpCache]:
    """Lookup cache entry (synchronous). Returns None if missing or expired.

    Originally implemented as async but invoked synchronously; adjusted to avoid
    un-awaited coroutine warnings and simplify monkeypatching in tests.
    """
    try:
        row = db.execute(
            select(HelpCache).where(HelpCache.cache_key == key)
        ).scalar_one_or_none()
    except Exception:
        return None
    if not row:
        return None
    if getattr(row, "expires_at", _now()) < _now():
        return None
    return row


def _upsert_cache(db: Session, key: str, etag: str, payload: Dict[str, Any]):
    exp = _now() + timedelta(seconds=HELP_TTL_SECONDS)
    existing = db.execute(
        select(HelpCache).where(HelpCache.cache_key == key)
    ).scalar_one_or_none()
    if existing:
        db.execute(
            update(HelpCache)
            .where(HelpCache.id == existing.id)
            .values(etag=etag, payload=payload, expires_at=exp)
        )
    else:
        db.execute(
            insert(HelpCache).values(
                cache_key=key, etag=etag, payload=payload, expires_at=exp
            )
        )


@router.post("")
def help_endpoint(
    req: HelpReq,
    if_none_match: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    # Validate mode
    if req.mode not in {"what", "why"}:
        raise HTTPException(400, "mode must be 'what' or 'why'")
    if req.mode == "why" and not req.base_text:
        raise HTTPException(400, "base_text required for mode=why")

    fp = _fingerprint(
        req.deterministic_ctx, req.base_text if req.mode == "why" else None
    )
    key = _build_key(req, fp)

    row = _cache_lookup(db, key)
    if row:
        etag = row.etag
        if if_none_match and if_none_match == etag:
            return JSONResponse(status_code=304, content=None, headers={"ETag": etag})
        return JSONResponse(row.payload, headers={"ETag": etag})

    # Miss: generate content
    if req.mode == "what":
        text = _CardPurpose.what(req.card_id)
        payload: Dict[str, Any] = {
            "mode": "what",
            "source": "deterministic",
            "text": text,
        }
    else:  # why
        assert req.base_text
        try:
            sys_msg = {
                "role": "system",
                "content": "Rewrite clearly in one short paragraph. Do not invent data.",
            }
            usr_msg = {
                "role": "user",
                "content": json.dumps(
                    {"summary": req.base_text, "context": req.deterministic_ctx}
                ),
            }
            reply, _trace = call_local_llm(model=MODEL_TAG, messages=[sys_msg, usr_msg])
            text = (reply or "").strip()
            payload = {
                "mode": "why",
                "source": "llm",
                "text": text or _deterministic_why_fallback(req.base_text),
            }
            if not text:
                payload["source"] = "fallback"
        except Exception as e:  # noqa: BLE001
            text = _deterministic_why_fallback(req.base_text)
            payload = {
                "mode": "why",
                "source": "fallback",
                "text": text,
                "error": str(getattr(e, "detail", e)),
            }

    etag = hashlib.md5(payload["text"].encode()).hexdigest()
    _upsert_cache(db, key, etag, payload)
    db.commit()

    return JSONResponse(payload, headers={"ETag": etag})
