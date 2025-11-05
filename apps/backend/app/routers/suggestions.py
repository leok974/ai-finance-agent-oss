"""Suggestions router - ML-powered category suggestions."""

# Updated: 2025-11-04 - Enhanced feedback schema with txn_id and label

from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Union, Optional, Literal
import time
import uuid

from ..config import settings
from ..services.metrics import (
    SUGGESTIONS_COVERED,
    SUGGESTIONS_ACCEPT,
    SUGGESTIONS_REJECT,
    SUGGESTIONS_LATENCY,
    HTTP_ERRORS,
)
from ..models.suggestions import SuggestionEvent, SuggestionFeedback
from ..db import SessionLocal, get_db
from ..services.suggest.serve import suggest_auto
from ..orm_models import Transaction
from sqlalchemy.orm import Session

router = APIRouter(prefix="/ml/suggestions", tags=["ml-suggestions"])


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

    # Accept ints or strings; will normalize to int in handler
    txn_ids: Union[List[str], List[int]]
    top_k: int | None = None
    mode: str = "auto"


class SuggestResponse(BaseModel):
    """Response containing suggestions for multiple transactions."""

    items: List[SuggestionItem]


class SuggestionFeedbackRequestV2(BaseModel):
    """User feedback on a suggestion - enhanced schema with txn_id and label."""

    model_config = ConfigDict(title="SuggestionFeedbackRequestV2")

    txn_id: int = Field(..., description="Transaction ID for analytics")
    action: Literal["accept", "reject"] = Field(..., description="User action")
    label: str = Field(..., description="Category label that was accepted or rejected")
    event_id: Optional[str] = Field(
        None, description="Optional link to suggestion event"
    )
    confidence: Optional[float] = Field(
        None, description="Confidence score if available"
    )
    reason: Optional[str] = Field(None, description="Optional explanation")
    user_id: Optional[str] = Field(None, description="Optional user identifier")


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
        HTTPException: If suggestions are disabled or invalid input
    """
    if not settings.SUGGEST_ENABLED:
        raise HTTPException(status_code=503, detail="Suggestions disabled")

    # Normalize txn_ids to ints early with helpful 400 on failure
    norm_ids: List[int] = []
    for tid in req.txn_ids:
        try:
            norm_ids.append(int(tid))
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid txn_id: {tid!r} - must be integer or numeric string",
            )

    t0 = time.time()
    top_k = req.top_k or settings.SUGGEST_TOPK

    items: List[SuggestionItem] = []
    covered = 0

    db = SessionLocal()
    try:
        for txn_id_int in norm_ids:
            txn = _get_txn_data(db, txn_id_int)
            if not txn:
                # Skip transactions not found
                continue

            # Use smart suggester with shadow/canary support
            # TODO: Extract user_id from request context for sticky canary
            user_id = str(txn.get("tenant_id", "default"))
            cands, model_id, features_hash, source = suggest_auto(txn, user_id=user_id)
            cands = cands[:top_k]
            if cands:
                covered += 1

            ev = SuggestionEvent(
                txn_id=txn_id_int,  # Use the actual transaction ID
                model_id=model_id,
                features_hash=features_hash,
                candidates=[dict(c) for c in cands],  # Convert to plain dicts for JSON
                mode=req.mode,
            )
            db.add(ev)
            db.flush()  # assign id

            items.append(
                SuggestionItem(
                    txn_id=str(txn_id_int),
                    candidates=[SuggestionCandidate(**c) for c in cands],
                    event_id=str(ev.id),
                )
            )

        db.commit()
    except Exception:
        # Track 5xx errors in metrics before re-raising
        HTTP_ERRORS.labels(route="/ml/suggestions").inc()
        raise
    finally:
        db.close()

    # Metrics are now tracked inside suggest_auto()
    if covered:
        SUGGESTIONS_COVERED.inc(covered)
    SUGGESTIONS_LATENCY.observe((time.time() - t0) * 1000.0)

    return SuggestResponse(items=items)


@router.post("/feedback", summary="Record suggestion feedback")
def feedback(req: SuggestionFeedbackRequestV2, db: Session = Depends(get_db)):
    """Record user feedback on a suggestion.

    Args:
        req: Feedback request with txn_id, action, label, and optional event_id

    Returns:
        Success response

    Raises:
        HTTPException: If action is invalid
    """
    # Parse event_id if provided
    event_uuid = None
    if req.event_id:
        try:
            event_uuid = uuid.UUID(req.event_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid event_id format")

        # Verify event exists if ID provided
        ev = db.get(SuggestionEvent, event_uuid)
        if not ev:
            raise HTTPException(status_code=404, detail="event not found")

    # Create feedback record with new schema
    fb = SuggestionFeedback(
        event_id=event_uuid,  # Nullable
        txn_id=req.txn_id,  # Required
        action=req.action,  # Enum: accept/reject
        label=req.label,  # Required category label
        confidence=req.confidence,
        reason=req.reason,
        user_id=req.user_id,
    )
    db.add(fb)
    db.commit()

    # Increment metrics
    if req.action == "accept":
        SUGGESTIONS_ACCEPT.labels(label=req.label).inc()
    elif req.action == "reject":
        SUGGESTIONS_REJECT.labels(label=req.label).inc()

    return {"ok": True}
