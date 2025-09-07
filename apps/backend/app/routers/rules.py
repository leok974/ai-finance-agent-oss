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
from app.schemas.rules import SaveTrainPayload, SaveTrainResponse, RuleCreateResponse, RuleTestPayload, RuleTestResponse, RuleListItem, RuleListResponse
from datetime import datetime, date
# from app.schemas import RuleIn  # optional: use a separate schema for input

router = APIRouter()

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
        exprs = [
            Rule.pattern.ilike(like),
            Rule.merchant.ilike(like),
            Rule.description.ilike(like),
            Rule.category.ilike(like),
        ]
        base = base.filter(or_(*exprs))

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
def test_rule(
    payload: RuleTestPayload = Body(...),
    db: Session = Depends(get_db),
    month: Optional[str] = Query(None, description="YYYY-MM; optional; overrides body.month if provided"),
):
    """
    Test a rule against transactions for an optional month window.
    - Filters by month: [first day, next month first day)
    - Matches case-insensitive on description OR merchant
    - Returns a count and a small sample
    Compatible with two payload shapes:
      1) { rule: { when: { description_like } }, month?: 'YYYY-MM' }
      2) legacy: rule object directly in body and month passed as query param
    """
    # Unify payload shape
    rule_obj = payload.rule if hasattr(payload, "rule") else (payload.get("rule") if isinstance(payload, dict) else None)
    month_val = month or (payload.month if hasattr(payload, "month") else (payload.get("month") if isinstance(payload, dict) else None))

    # Extract like string
    like_val = None
    if isinstance(rule_obj, dict):
        w = rule_obj.get("when") or {}
        like_val = (w.get("description_like") or "").strip()
    else:
        try:
            w = getattr(rule_obj, "when", None) or {}
            like_val = (getattr(w, "description_like", "") or "").strip()
        except Exception:
            like_val = ""

    if not like_val:
        return {"count": 0, "sample": []}

    q = db.query(Transaction)
    # Prefer indexed equality on Transaction.month if provided
    if month_val:
        q = q.filter(Transaction.month == month_val)
    # Alternatively, use date bounds if you prefer:
    # else:
    #     start_d, end_d = _month_bounds(month_val)
    #     if start_d and end_d:
    #         q = q.filter(and_(Transaction.date >= start_d, Transaction.date < end_d))

    like_expr = f"%{like_val}%"
    q = q.filter(or_(Transaction.description.ilike(like_expr), Transaction.merchant.ilike(like_expr)))

    total = q.count()
    rows = q.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(10).all()
    sample = [
        {
            "id": getattr(r, "id", None),
            "date": str(getattr(r, "date", "")),
            "merchant": getattr(r, "merchant", None),
            "description": getattr(r, "description", None),
            "amount": float(getattr(r, "amount", 0.0) or 0.0),
            "category": getattr(r, "category", None),
        }
        for r in rows
    ]

    return {"count": int(total), "sample": sample, "month": month_val}


# --- Save → Train → Reclassify (convenience endpoint) -----------------------
# Use schemas module types for the unified endpoint


@router.post(
    "/save-train-reclass",
    response_model=SaveTrainResponse,
    summary="Save, train, and reclassify",
    description="Saves a rule, retrains the model (if available), and reclassifies transactions for the selected month.",
)
def save_train_reclass(payload: SaveTrainPayload, db: Session = Depends(get_db)) -> SaveTrainResponse:
    # 1) Save rule via service
    r = rules_service.create_rule(db, payload.rule)

    # 2) Retrain model (best-effort)
    try:
        ml_train_service.retrain_model(db, month=payload.month, min_samples=6, test_size=0.2)
    except Exception:
        pass

    # 3) Reclassify and return count
    count = txns_service.reclassify_transactions(db, payload.month)
    # Prefer service-attached display_name; fallback to derived
    display_name = getattr(r, "display_name", None) or _derived_name_from_fields(getattr(r, "target", None), getattr(r, "pattern", None), getattr(r, "category", None))
    return SaveTrainResponse(rule_id=str(r.id), display_name=display_name, reclassified=int(count))
