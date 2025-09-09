from typing import List, Literal, Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, conint
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.transactions import Transaction

router = APIRouter(prefix="/agent/tools/rules", tags=["agent-tools:rules"])

Target = Literal["merchant", "description"]


class RuleBody(BaseModel):
    pattern: str = Field(..., min_length=1, description="Case-insensitive substring")
    target: Target
    category: str = Field(..., min_length=1)
    month: str = Field(..., description="YYYY-MM to test/apply against")
    # Use Field constraints to appease type checkers instead of conint
    limit: int = Field(1000, ge=1, le=10000, description="Max matches to return/apply")


class HitDTO(BaseModel):
    id: int
    date: str
    month: str
    merchant: str
    description: str
    amount: float
    category: str | None = None


class TestResp(BaseModel):
    month: str
    total_hits: int
    sample: List[HitDTO]  # up to 50 for preview
    candidate_category: str
    rule: Dict[str, Any]


class ApplyResp(BaseModel):
    month: str
    matched_ids: List[int]
    updated: int
    category: str
    rule: Dict[str, Any]




def _unlabeled_condition():
    return (
        (Transaction.category.is_(None))
        | (func.trim(Transaction.category) == "")
        | (func.lower(Transaction.category) == "unknown")
    )


@router.post("/test", response_model=TestResp)
def test_rule(body: RuleBody, db: Session = Depends(get_db)) -> TestResp:
    like = f"%{body.pattern}%"
    column = Transaction.merchant if body.target == "merchant" else Transaction.description

    q = (
        db.query(Transaction)
        .filter(Transaction.month == body.month)
        .filter(column.ilike(like))
    )

    total = q.count()

    sample_rows = (
        q.order_by(Transaction.id.asc())
        .limit(min(50, body.limit))
        .all()
    )

    sample = [
        HitDTO(
            id=t.id,
            date=str(t.date),
            month=t.month,
            merchant=t.merchant or "",
            description=t.description or "",
            amount=float(t.amount),
            category=t.category,
        )
        for t in sample_rows
    ]

    return TestResp(
        month=body.month,
        total_hits=int(total),
        sample=sample,
        candidate_category=body.category,
        rule={"pattern": body.pattern, "target": body.target},
    )


@router.post("/apply", response_model=ApplyResp)
def apply_rule(body: RuleBody, db: Session = Depends(get_db)) -> ApplyResp:
    like = f"%{body.pattern}%"
    column = Transaction.merchant if body.target == "merchant" else Transaction.description

    # By default, only act on unlabeled; change to hit everything by dropping _unlabeled_condition()
    q = (
        db.query(Transaction.id)
        .filter(Transaction.month == body.month)
        .filter(column.ilike(like))
        .filter(_unlabeled_condition())
        .limit(body.limit)
    )
    ids = [row[0] for row in q.all()]

    updated = 0
    if ids:
        updated = (
            db.query(Transaction)
            .filter(Transaction.id.in_(ids))
            .update({Transaction.category: body.category}, synchronize_session=False)
        )
        db.commit()

    return ApplyResp(
        month=body.month,
        matched_ids=ids,
        updated=int(updated),
        category=body.category,
        rule={"pattern": body.pattern, "target": body.target},
    )


