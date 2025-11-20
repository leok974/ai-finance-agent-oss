"""ML Feedback Router - Record user feedback on ML suggestions."""
from datetime import datetime
from typing import Literal, Optional

import logging
from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ml",
    tags=["ml"],
)


class MlFeedbackPayload(BaseModel):
    """
    Payload sent from the frontend when a user accepts / rejects a model suggestion.
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
async def ml_feedback(request: Request, payload: MlFeedbackPayload) -> MlFeedbackResponse:
    """
    Record ML feedback when the user accepts / rejects a suggestion.

    For now this writes to logs; you can later pipe these logs to your
    warehouse / training pipeline, or persist to a DB table.
    """
    ts = datetime.utcnow().isoformat()

    logger.info(
        "ml_feedback_event",
        extra={
            "txn_id": payload.txn_id,
            "category": payload.category,
            "action": payload.action,
            "score": payload.score,
            "model": payload.model,
            "source": payload.source or "unknowns-panel",
            "ts": ts,
            # You can add more context here later (user_id, request_id, etc.)
        },
    )

    # If you later want DB persistence, this is where you'd insert a row
    # into an ml_feedback_events table.

    return MlFeedbackResponse(ok=True)
