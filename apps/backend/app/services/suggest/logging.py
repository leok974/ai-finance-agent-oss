"""Centralized suggestion logging."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.orm_models import Suggestion


def log_suggestion(
    db: Session,
    *,
    txn_id: str,
    label: str,
    confidence: float,
    reasons: list[dict],
    source: str,  # 'model' or 'rule' or 'ask'
    model_version: str | None,
    accepted: bool | None = None,
):
    """Log a suggestion to the database.

    Args:
        db: Database session
        txn_id: Transaction ID
        label: Suggested category label
        confidence: Confidence score (0-1)
        reasons: List of reason dictionaries
        source: Source type ('model', 'rule', 'ask')
        model_version: Model version identifier
        accepted: Whether suggestion was accepted by user
    """
    rec = Suggestion(
        txn_id=txn_id,
        label=label,
        confidence=confidence,
        reason_json=reasons,
        source=source,
        model_version=model_version,
        accepted=accepted,
        timestamp=datetime.utcnow(),
    )
    db.add(rec)
