from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional, Literal
from ..utils.dates import latest_month_from_txns
from fastapi import Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from app.db import get_db
from app.services.budget_recommend import compute_recommendations
from pydantic import BaseModel
from app.orm_models import Budget, Transaction

router = APIRouter()

@router.get("/list")
def list_budgets(db: Session = Depends(get_db)) -> Dict[str, float]:
    rows = db.query(Budget.category, Budget.amount).all()
    return {cat: float(amt) for cat, amt in rows}

@router.get("/check")
def budget_check(month: Optional[str] = None, db: Session = Depends(get_db)) -> List[Dict]:
    # Resolve month (YYYY-MM) from DB if not provided
    if not month:
        max_dt = db.query(func.max(Transaction.date)).scalar()
        if not max_dt:
            return []
        month = f"{max_dt.year:04d}-{max_dt.month:02d}"

    # Load budgets from DB
    budgets = {cat: float(amt) for cat, amt in db.query(Budget.category, Budget.amount).all()}
    if not budgets:
        return []

    # Compute spent per category for the month (expenses as positive magnitude)
    start_y, start_m = map(int, month.split("-"))
    start_date = date(start_y, start_m, 1)
    end_date = date(start_y + (1 if start_m == 12 else 0), (1 if start_m == 12 else start_m + 1), 1)
    rows = (
        db.query(Transaction.category, func.sum(func.abs(Transaction.amount)))
        .filter(
            Transaction.date >= start_date,
            Transaction.date < end_date,
            Transaction.amount < 0,
            Transaction.category.isnot(None),
            Transaction.category != "",
            Transaction.category != "Unknown",
        )
        .group_by(Transaction.category)
        .all()
    )
    spent = {cat: float(total or 0.0) for cat, total in rows}

    out: List[Dict] = []
    for cat, limit in budgets.items():
        s = spent.get(cat, 0.0)
        out.append({
            "category": cat,
            "spent": round(s, 2),
            "limit": round(limit, 2),
            "over": round(max(0.0, s - float(limit)), 2),
        })
    return out

class ApplyReq(BaseModel):
    strategy: Literal["median","p75","median_plus_10"] = "median"
    categories_include: Optional[List[str]] = None
    categories_exclude: Optional[List[str]] = None
    months: int = 6


@router.get("/recommendations")
def get_budget_recommendations(
    months: int = Query(6, ge=3, le=24),
    include_current: bool = True,
    include_only_over_p75: bool = False,
    include: Optional[str] = None,
    exclude: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return per-category budget recommendations computed from last N full months.
    Supports filters and current-month over-p75 flagging.
    """
    recs = compute_recommendations(db, months=months, include_current=include_current)
    inc = set([s.strip() for s in include.split(",")]) if include else None
    exc = set([s.strip() for s in exclude.split(",")]) if exclude else set()

    def _keep(r: Dict):
        if inc and r["category"] not in inc:
            return False
        if r["category"] in exc:
            return False
        if include_only_over_p75 and not r.get("over_p75"):
            return False
        return True

    recs = [r for r in recs if _keep(r)]
    return {"months": months, "recommendations": recs}


@router.post("/apply")
def apply_budgets(payload: ApplyReq, db: Session = Depends(get_db)):
    recs = compute_recommendations(db, months=payload.months, include_current=True)
    inc = set(payload.categories_include or [])
    exc = set(payload.categories_exclude or [])

    def want(r: Dict):
        if inc and r["category"] not in inc:
            return False
        if r["category"] in exc:
            return False
        return True

    picked: List[tuple[str, float]] = []
    for r in recs:
        if not want(r):
            continue
        amt = r["median"]
        if payload.strategy == "p75":
            amt = r["p75"]
        elif payload.strategy == "median_plus_10":
            amt = r["median"] * 1.10
        picked.append((r["category"], round(float(amt), 2)))

    # Upsert by category (portable fallback across SQLite/Postgres)
    for cat, amount in picked:
        obj = db.query(Budget).filter(Budget.category == cat).one_or_none()
        if obj:
            obj.amount = amount
        else:
            db.add(Budget(category=cat, amount=amount))
    db.commit()

    return {"ok": True, "applied": [{"category": c, "amount": a} for c, a in picked]}
