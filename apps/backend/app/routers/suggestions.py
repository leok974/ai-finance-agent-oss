"""Suggestions router - ML-powered category suggestions."""

from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict
from datetime import datetime
import time
import uuid

from ..config import settings
from ..services.metrics import (
    SUGGESTIONS_TOTAL,
    SUGGESTIONS_COVERED,
    SUGGESTIONS_ACCEPT,
    SUGGESTIONS_REJECT,
    SUGGESTIONS_LATENCY,
)
from ..models.suggestions import SuggestionEvent, SuggestionFeedback
from ..db import SessionLocal
from ..services.suggest.heuristics import suggest_for_txn
from ..services.suggest.serve import suggest_auto
from ..orm_models import Transaction

router = APIRouter(prefix="/agent/tools/suggestions", tags=["suggestions"])


class SuggestionCandidate(BaseModel):
    """A single category suggestion candidate."""

    label: str
    confidence: float
    reasons: List[str]


class SuggestionItem(BaseModel):
    """Suggestions for a single transaction."""

    txn_id: str
    candidates: List[SuggestionCandidate]
    event_id: str | None = None


class SuggestRequest(BaseModel):
    """Request for category suggestions."""

    txn_ids: List[str]
    top_k: int | None = None
    mode: str = "auto"


class SuggestResponse(BaseModel):
    """Response containing suggestions for multiple transactions."""

    items: List[SuggestionItem]


class FeedbackRequest(BaseModel):
    """User feedback on a suggestion."""

    event_id: str
    action: str  # accept|reject|undo
    reason: str | None = None
    user_ts: float | None = None


def _get_txn_data(db, txn_id: int) -> Dict | None:
    """Fetch transaction data from database.
    
    Args:
        db: Database session
        txn_id: Transaction ID
        
    Returns:
        Transaction dict with merchant, description, amount, etc. or None if not found
    """
    try:
        txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
        if not txn:
            return None
        
        # Build transaction dict for heuristic suggester
        return {
            "id": txn.id,
            "merchant": txn.merchant or "",
            "memo": txn.description or "",
            "amount": txn.amount or 0.0,
            "category": txn.category,
            "account": txn.account,
            "date": txn.date.isoformat() if txn.date else None,
        }
    except Exception:
        return None


@router.post("", response_model=SuggestResponse)
def suggest(req: SuggestRequest):
    """Generate category suggestions for transactions.

    Args:
        req: Request with transaction IDs and configuration

    Returns:
        Suggestions for each transaction

    Raises:
        HTTPException: If suggestions are disabled
    """
    if not settings.SUGGEST_ENABLED:
        raise HTTPException(status_code=503, detail="Suggestions disabled")

    t0 = time.time()
    top_k = req.top_k or settings.SUGGEST_TOPK

    items: List[SuggestionItem] = []
    covered = 0

    db = SessionLocal()
    try:
        for txn_id in req.txn_ids:
            # Convert txn_id to int (transaction IDs are integers in DB)
            try:
                txn_id_int = int(txn_id)
            except ValueError:
                # Skip invalid IDs
                continue
                
            txn = _get_txn_data(db, txn_id_int)
            if not txn:
                # Skip transactions not found
                continue
            
            # Use smart suggester with shadow/canary support
            cands, model_id, features_hash, source = suggest_auto(txn)
            cands = cands[:top_k]
            if cands:
                covered += 1

            ev = SuggestionEvent(
                txn_id=uuid.uuid4(),  # Generate UUID for event tracking
                model_id=model_id,
                features_hash=features_hash,
                candidates=[dict(c) for c in cands],  # Convert to plain dicts for JSON
                mode=req.mode,
            )
            db.add(ev)
            db.flush()  # assign id

            items.append(
                SuggestionItem(
                    txn_id=txn_id,
                    candidates=[SuggestionCandidate(**c) for c in cands],
                    event_id=str(ev.id),
                )
            )

        db.commit()
    finally:
        db.close()

    # Metrics are now tracked inside suggest_auto()
    if covered:
        SUGGESTIONS_COVERED.inc(covered)
    SUGGESTIONS_LATENCY.observe((time.time() - t0) * 1000.0)

    return SuggestResponse(items=items)


@router.post("/feedback")
def feedback(req: FeedbackRequest):
    """Record user feedback on a suggestion.

    Args:
        req: Feedback request with action and optional reason

    Returns:
        Success response

    Raises:
        HTTPException: If action is invalid or event not found
    """
    if req.action not in {"accept", "reject", "undo"}:
        raise HTTPException(status_code=400, detail="invalid action")

    db = SessionLocal()
    try:
        try:
            event_uuid = uuid.UUID(req.event_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid event_id format")

        ev = db.get(SuggestionEvent, event_uuid)
        if not ev:
            raise HTTPException(status_code=404, detail="event not found")

        fb = SuggestionFeedback(
            event_id=ev.id,
            action=req.action,
            reason=req.reason,
            user_ts=(
                None if req.user_ts is None else datetime.fromtimestamp(req.user_ts)
            ),
        )
        db.add(fb)
        db.commit()

        # increment metrics by top-1 label for quick proxy stats
        if ev.candidates and len(ev.candidates) > 0:
            top = ev.candidates[0]
            label = top.get("label", "unknown")
            if req.action == "accept":
                SUGGESTIONS_ACCEPT.labels(label=label).inc()
            elif req.action == "reject":
                SUGGESTIONS_REJECT.labels(label=label).inc()
    finally:
        db.close()

    return {"ok": True}
