from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, and_, or_, func
from app.db import get_db
from pydantic import BaseModel, ConfigDict
from app.orm_models import Rule
from app.services.rules_apply import latest_month_from_data, apply_all_active_rules
from app.services import rules_service, ml_train_service, txns_service
from app.orm_models import Transaction
from app.schemas.rules import (
    SaveTrainPayload,
    SaveTrainResponse,
    RuleCreateResponse,
    RuleTestPayload,
    RuleTestResponse,
    RuleListItem,
    RuleListResponse,
    TransactionSample,
)
from datetime import datetime, date
# from app.schemas import RuleIn  # optional: use a separate schema for input

router = APIRouter()

@router.get("/ping")
def ping():
    return {"ok": True}

def _derived_name_from_fields(target: Optional[str], pattern: Optional[str], category: Optional[str]) -> str:
    like = (pattern or "").strip()
    cat = (category or "Uncategorized").strip()
    return f"{like or 'Any'} → {cat}"

class CompatRuleInput(BaseModel):
    """Liberal rule input accepting extra keys and a flexible shape.
    Expected keys from web: name, enabled, when{ description_like? }, then{ category }
    """
    model_config = ConfigDict(extra="allow")
    name: str
    enabled: bool = True
    when: Dict[str, Any] = {}
    then: Dict[str, Any] = {}

def map_to_orm_fields(body: CompatRuleInput) -> Dict[str, Any]:
    """Map compat input to our ORM Rule fields (pattern/target/category/active)."""
    when = body.when or {}
    then = body.then or {}
    category = then.get("category")
    if not category:
        raise HTTPException(status_code=422, detail="then.category is required")

    # Prefer description_like, fallback merchant[_like]
    target = None
    pattern = None
    if isinstance(when, dict):
        if when.get("description_like"):
            target = "description"
            pattern = str(when.get("description_like"))
        elif when.get("merchant_like"):
            target = "merchant"
            pattern = str(when.get("merchant_like"))
        elif when.get("merchant"):
            target = "merchant"
            pattern = str(when.get("merchant"))

    return {
        "pattern": pattern,
        "target": target,
        "category": category,
        "active": bool(body.enabled),
    }


@router.get(
    "",
    response_model=RuleListResponse,
    summary="List rules",
    description=(
        "Returns rules ordered by `updated_at desc`.\n\n"
        "Query params:\n"
        "- `active`: filter by enabled state\n"
        "- `q`: search pattern/merchant/description/category (ILIKE)\n"
        "- `limit`/`offset`: pagination (defaults: 50 / 0)\n"
    ),
)
def list_rules(
    active: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Text search (ILIKE) across pattern, merchant, description, category"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> RuleListResponse:
    base = db.query(Rule)
    if active is not None:
        base = base.filter(Rule.active == bool(active))
    if q:
        like = f"%{q.strip()}%"
        conds = []
        # Include Rule.name when available on ORM model
        if hasattr(Rule, "name"):
            conds.append(Rule.name.ilike(like))
        # Only append valid conditions; avoid placing raw False/None into or_()
        for col in (getattr(Rule, "pattern", None), getattr(Rule, "merchant", None), getattr(Rule, "description", None), getattr(Rule, "category", None)):
            if col is not None:
                conds.append(col.ilike(like))
        if conds:
            base = base.filter(or_(*conds))

    total = base.with_entities(func.count(Rule.id)).scalar() or 0
    rows = base.order_by(Rule.updated_at.desc()).limit(limit).offset(offset).all()
    items: List[RuleListItem] = []
    for r in rows:
        display = _derived_name_from_fields(getattr(r, "target", None), getattr(r, "pattern", None), getattr(r, "category", None))
        items.append(RuleListItem(
            id=int(getattr(r, "id", 0) or 0),
            display_name=display,
            category=getattr(r, "category", None),
            active=bool(getattr(r, "active", True)),
        ))
    return RuleListResponse(items=items, total=int(total), limit=int(limit), offset=int(offset))


@router.get(
    "/list",
    response_model=RuleListResponse,
    summary="List rules",
    description="Returns rules ordered by `updated_at desc`. Optional query params: `active`, `limit`, `offset`.",
)
def list_rules_brief(
    active: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
) -> RuleListResponse:
    q = db.query(Rule)
    if active is not None:
        q = q.filter(Rule.active == bool(active))
    total = q.count()
    q = q.order_by(Rule.updated_at.desc()).limit(limit).offset(offset)
    rows = q.all()
    items: List[RuleListItem] = []
    for r in rows:
        display = _derived_name_from_fields(getattr(r, "target", None), getattr(r, "pattern", None), getattr(r, "category", None))
        items.append(RuleListItem(
            id=int(getattr(r, "id", 0) or 0),
            display_name=display,
            category=getattr(r, "category", None),
            active=bool(getattr(r, "active", True)),
        ))
    return RuleListResponse(items=items, total=int(total), limit=int(limit), offset=int(offset))


@router.post(
    "",
    response_model=RuleCreateResponse,
    summary="Create a rule",
    description=(
        "Creates a rule from a description pattern and category.\n\n"
        "Request body example:\n"
        "{\n"
        "  \"name\": \"NETFLIX → Subscriptions\",\n"
        "  \"when\": { \"description_like\": \"NETFLIX\" },\n"
        "  \"then\": { \"category\": \"Subscriptions\" }\n"
        "}\n\n"
        "Response example:\n"
        "{ \"id\": \"124\", \"display_name\": \"NETFLIX → Subscriptions\" }"
    ),
)
def add_rule(body: CompatRuleInput = Body(...), db: Session = Depends(get_db)):
    # Use service to persist and compute a display name
    r = rules_service.create_rule(db, body)
    display = getattr(r, "display_name", None) or _derived_name_from_fields(getattr(r, "target", None), getattr(r, "pattern", None), getattr(r, "category", None))
    return RuleCreateResponse(id=str(getattr(r, "id", "")), display_name=display)


@router.delete("")
def clear_rules(db: Session = Depends(get_db)):
    db.execute(delete(Rule))
    db.commit()
    return {"ok": True}


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    res = db.execute(delete(Rule).where(Rule.id == rule_id))
    if getattr(res, "rowcount", 0) == 0:
        raise HTTPException(status_code=404, detail="not found")
    db.commit()
    return {"ok": True}


# --- Rule test endpoint (month-bounded; merchant OR description match) ------


def _month_bounds(yyyy_mm: Optional[str]) -> tuple[Optional[date], Optional[date]]:
    """Return (start_date, end_date) for the month, where end is first day of next month.
    If yyyy_mm is falsy, returns (None, None).
    """
    if not yyyy_mm:
        return None, None
    try:
        start_dt = datetime.strptime(yyyy_mm, "%Y-%m").date()
    except Exception:
        # Invalid month, treat as no filter
        return None, None
    year = start_dt.year + (1 if start_dt.month == 12 else 0)
    month2 = 1 if start_dt.month == 12 else start_dt.month + 1
    end_dt = date(year, month2, 1)
    return start_dt, end_dt


@router.post(
    "/test",
    response_model=RuleTestResponse,
    summary="Test a rule against transactions",
    description="Matches transactions by description/merchant for the given month (YYYY-MM). Returns a count and a small sample.",
)
def test_rule(payload: RuleTestPayload, db: Session = Depends(get_db)):
    # Validate presence of rule.when
    if payload.rule is None or getattr(payload.rule, "when", None) is None:
        raise HTTPException(status_code=400, detail="Missing rule.when")

    like_val = (getattr(payload.rule.when, "description_like", "") or "").strip()
    if not like_val:
        return RuleTestResponse(count=0, sample=[])

    q = db.query(Transaction)
    if payload.month:
        q = q.filter(Transaction.month == payload.month)
    like_expr = f"%{like_val}%"
    try:
        q = q.filter(or_(Transaction.description.ilike(like_expr), Transaction.merchant.ilike(like_expr)))
        total = q.count()
        rows = q.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(5).all()
        sample: List[TransactionSample] = [
            TransactionSample(
                id=int(getattr(t, "id", 0) or 0),
                merchant=getattr(t, "merchant", None),
                description=getattr(t, "description", None),
                date=(getattr(t, "date", None).isoformat() if getattr(t, "date", None) else None),
            )
            for t in rows
        ]
        return RuleTestResponse(count=int(total), sample=sample)
    except Exception as e:
        # Surface a clear 400 instead of connection reset
        raise HTTPException(status_code=400, detail=f"Test failed: {e}")


# --- Save → Train → Reclassify (convenience endpoint) -----------------------
# Use schemas module types for the unified endpoint


@router.post(
    "/save-train-reclass",
    response_model=SaveTrainResponse,
    summary="Save, train, and reclassify",
    description="Saves a rule, retrains the model (if available), and reclassifies transactions for the selected month.",
)
def save_train_reclass(payload: SaveTrainPayload, db: Session = Depends(get_db)) -> SaveTrainResponse:
    # Validate presence of rule.then
    if payload.rule is None or getattr(payload.rule, "then", None) is None:
        raise HTTPException(status_code=400, detail="Missing rule.then")
    try:
        # 1) Save rule via service
        r = rules_service.create_rule(db, payload.rule)

        # 2) Retrain model (best-effort; swallow errors)
        try:
            ml_train_service.retrain_model(db)
        except Exception:
            pass

        # 3) Reclassify and return count
        reclassified = txns_service.reclassify_transactions(db, payload.month)
        return SaveTrainResponse(
            rule_id=str(r.id),
            display_name=getattr(r, "name", f"Rule {r.id}"),
            reclassified=reclassified,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Save/train/reclass failed: {e}")
