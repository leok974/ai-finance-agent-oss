"""ML Feedback Router - Record user feedback on ML suggestions."""

from datetime import datetime
from typing import Literal, Optional

import logging
from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.ml_feedback import MlFeedbackEvent

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ml",
    tags=["ml"],
)


class MlFeedbackPayload(BaseModel):
    """
    Feedback from the UI when a user interacts with ML suggestions.
    """

    txn_id: int = Field(..., ge=1)
    category: str = Field(..., min_length=1, max_length=128)
    action: Literal["accept", "reject", "undo"]
    score: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Optional model confidence score in [0,1]",
    )
    model: Optional[str] = Field(
        None,
        max_length=128,
        description="Model identifier (e.g. 'lm-scorer-v1')",
    )
    source: Optional[str] = Field(
        None,
        max_length=64,
        description="UI source, e.g. 'unknowns-panel'",
    )


class MlFeedbackResponse(BaseModel):
    ok: bool


@router.post(
    "/feedback",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MlFeedbackResponse,
)
async def ml_feedback(
    request: Request,
    payload: MlFeedbackPayload,
    db: Session = Depends(get_db),
) -> MlFeedbackResponse:
    """
    Record ML feedback and lightly update merchant/category priors.

    This endpoint is *fire-and-forget* from the UI perspective – it should
    never block or break the main categorization flow.
    """
    user_id = getattr(request.state, "user_id", None)

    event = MlFeedbackEvent(
        txn_id=payload.txn_id,
        user_id=user_id,
        category=payload.category,
        action=payload.action,
        score=payload.score,
        model=payload.model,
        source=payload.source or "unknowns-panel",
    )
    db.add(event)

    # Update aggregate stats used by the suggester
    event.apply_to_stats(db)

    db.commit()

    logger.info(
        "ml_feedback_event",
        extra={
            "txn_id": payload.txn_id,
            "user_id": str(user_id) if user_id else None,
            "category": payload.category,
            "action": payload.action,
            "score": payload.score,
            "model": payload.model,
            "source": payload.source or "unknowns-panel",
        },
    )

    return MlFeedbackResponse(ok=True)
