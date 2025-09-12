from fastapi import APIRouter, HTTPException, Depends, Query, Body, Path
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, and_, or_, func
from app.db import get_db
from pydantic import BaseModel, ConfigDict, Field
from app.models import Rule
from app.services.rules_apply import latest_month_from_data, apply_all_active_rules
from app.services import rules_service, ml_train_service, txns_service
from app.transactions import Transaction
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
import app.services.rule_suggestions as rs
from app.services.rules_preview import preview_rule_matches, backfill_rule_apply, normalize_rule_input
from app.utils.auth import require_roles
from app.utils.csrf import csrf_protect
from app.services.rule_suggestions import mine_suggestions
from app.services.rule_suggestions import (
    list_suggestions as list_persisted_suggestions,
    accept_suggestion as accept_persisted_suggestion,
    dismiss_suggestion as dismiss_persisted_suggestion,
)
from app.utils.state import current_month_key
from app.services.rules_budget import list_budget_rules
from app.utils.state import (
    PERSISTED_SUGGESTIONS,
    PERSISTED_SUGGESTIONS_SEQ,
    PERSISTED_SUGGESTIONS_IDX,
    _sugg_key,
)
from datetime import datetime as _dt
from pydantic import Field as _Field
from app.services.rule_suggestions_store import list_persisted as _db_list_persisted, upsert_from_mined as _db_upsert_from_mined, set_status as _db_set_status, clear_non_new as _db_clear_non_new
from app.orm_models import RuleSuggestion  # legacy suggestions table for compat fallback
from app.services.rule_suggestion_ignores_store import (
    list_ignores as rsi_list,
    list_ignores_cached as rsi_list_cached,
    add_ignore as rsi_add,
    remove_ignore as rsi_remove,
)

router = APIRouter(prefix="/rules", tags=["rules"])
@router.get("/suggestions/config")
def rules_suggestions_config():
    # Read from module each call to reflect env + reloads
    return rs.get_config()

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
    "/",
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

    # Optionally merge budget caps as virtual rules at the end when requesting the first page
    if offset == 0:
        for b in list_budget_rules(db):
            items.append(RuleListItem(
                id=b["id"],
                display_name=b.get("display_name") or b.get("name") or f"Budget: {b.get('category')}",
                kind="budget",
                description=b.get("description"),
                category=b.get("category"),
                active=True,
            ))
    return RuleListResponse(items=items, total=int(total), limit=int(limit), offset=int(offset))


# Alias binding to exact /rules (no trailing slash) with the same behavior
@router.get(
    "",
    response_model=RuleListResponse,
    summary="List rules (alias)",
    description="Alias of GET /rules/ that binds to /rules without trailing slash.",
)
def list_rules_alias(
    active: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Text search (ILIKE) across pattern, merchant, description, category"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> RuleListResponse:
    return list_rules(active=active, q=q, limit=limit, offset=offset, db=db)


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
    "/",
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


@router.delete("/", dependencies=[Depends(csrf_protect)])
def clear_rules(db: Session = Depends(get_db)):
    db.execute(delete(Rule))
    db.commit()
    return {"ok": True}


@router.delete("/{rule_id}", dependencies=[Depends(csrf_protect)])
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
        # Keep response minimal to satisfy existing tests
        return SaveTrainResponse(
            rule_id=str(r.id),
            reclassified=reclassified,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Save/train/reclass failed: {e}")

@router.post("/preview", dependencies=[Depends(require_roles("admin")), Depends(csrf_protect)])
def preview_rule(
    payload: Dict[str, Any],
    window_days: Optional[int] = Query(default=None, description="Number of days to look back (inclusive)"),
    only_uncategorized: bool = Query(default=True, description="Match only uncategorized txns (None/empty/'Unknown')"),
    sample_limit: int = Query(default=10, ge=1, le=100, description="Max sample rows to return"),
    db: Session = Depends(get_db),
):
    total, samples = preview_rule_matches(db, payload, window_days, only_uncategorized, sample_limit)
    return {"matches_count": total, "sample_txns": samples}

@router.post("/{rule_id}/backfill", dependencies=[Depends(require_roles("admin")), Depends(csrf_protect)])
def backfill_rule(
    rule_id: int,
    params: Dict[str, Any],
    window_days: Optional[int] = Query(default=None, description="Number of days to look back (inclusive)"),
    only_uncategorized: bool = Query(default=True, description="Match only uncategorized txns (None/empty/'Unknown')"),
    dry_run: bool = Query(default=False, description="If true, do not persist changes"),
    limit: Optional[int] = Query(default=None, ge=1, le=10000, description="Optional maximum rows to process"),
    db: Session = Depends(get_db),
):
    rule: Rule = db.query(Rule).get(rule_id)  # type: ignore
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule_input = (
        params
        if ("when" in params or "pattern" in params)
        else {"when": {"target": getattr(rule, "target", "description"), "pattern": getattr(rule, "pattern", "")}, "then": {"category": getattr(rule, "category", None)}}
    )
    result = backfill_rule_apply(db, rule_input, window_days, only_uncategorized, dry_run, limit)
    return {"ok": True, "dry_run": dry_run, **result}

# --- Suggestions (feedback-mined) -------------------------------------------

# In-memory ignore list (merchant, category)
SUGGESTION_IGNORES: set[tuple[str, str]] = set()

class SuggestionResp(BaseModel):
    merchant: str
    category: str
    count: int
    window_days: int
    sample_txn_ids: List[int] = []
    recent_month_key: Optional[str] = None

class SuggestionsListResp(BaseModel):
    window_days: int
    min_count: int
    suggestions: List[SuggestionResp] = []


@router.get("/suggestions")
def list_rule_suggestions(
    window_days: int = Query(60, ge=7, le=180, description="Lookback window"),
    min_count: int = Query(3, ge=2, le=20, description="Minimum repeated confirmations"),
    max_results: int = Query(25, ge=1, le=100),
    exclude_merchants: Optional[str] = Query(None, description="Comma-separated merchants to exclude"),
    exclude_categories: Optional[str] = Query(None, description="Comma-separated categories to exclude"),
    # Persisted suggestion query (when provided, we return list response)
    merchant_norm: Optional[str] = Query(None, description="Filter persisted suggestions by canonical merchant"),
    category: Optional[str] = Query(None, description="Filter persisted suggestions by category"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    # If persisted filters are provided, return the persisted list shape (list of dicts)
    if merchant_norm is not None or category is not None:
        return list_persisted_suggestions(
            db,
            merchant_norm=merchant_norm,
            category=category,
            limit=limit,
            offset=offset,
        )

    # Otherwise, compute mined suggestions summary shape
    exc_m = [s.strip() for s in (exclude_merchants or "").split(",") if s.strip()]
    exc_c = [s.strip() for s in (exclude_categories or "").split(",") if s.strip()]
    items = mine_suggestions(
        db,
        window_days=window_days,
        min_count=min_count,
        max_results=max_results,
        exclude_merchants=exc_m,
        exclude_categories=exc_c,
    )
    items = [s for s in items if (s["merchant"], s["category"]) not in SUGGESTION_IGNORES]
    return {"window_days": window_days, "min_count": min_count, "suggestions": items}


class ApplySuggestionReq(BaseModel):
    merchant: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    backfill_month: Optional[str] = Field(None, description='Month "YYYY-MM" to backfill; defaults to recent')


class ApplySuggestionResp(BaseModel):
    ok: bool = True
    rule_id: int
    merchant: str
    category: str
    applied_backfill_month: Optional[str] = None


@router.post("/suggestions/apply", response_model=ApplySuggestionResp, dependencies=[Depends(csrf_protect)])
def apply_rule_suggestion(payload: ApplySuggestionReq, db: Session = Depends(get_db)):
    # Create or activate rule
    r = db.query(Rule).filter(Rule.merchant == payload.merchant, Rule.category == payload.category).one_or_none()
    if r:
        if hasattr(r, "active"):
            r.active = True
    else:
        r = Rule(merchant=payload.merchant, category=payload.category, active=True)
        db.add(r)
    db.commit()
    db.refresh(r)

    backfill_month = payload.backfill_month or current_month_key()
    return {"ok": True, "rule_id": r.id, "merchant": r.merchant, "category": r.category, "applied_backfill_month": backfill_month}


class IgnoreSuggestionReq(BaseModel):
    merchant: str
    category: str


@router.post("/suggestions/ignore", dependencies=[Depends(csrf_protect)])
def ignore_rule_suggestion(payload: IgnoreSuggestionReq):
    SUGGESTION_IGNORES.add((payload.merchant, payload.category))
    return {
        "ignored": sorted(
            [{"merchant": m, "category": c} for m, c in SUGGESTION_IGNORES],
            key=lambda x: (x["merchant"].lower(), x["category"].lower()),
        )
    }


# (Removed older compat endpoints to avoid path conflicts; see persisted stubs below)


# --- Persisted suggestions (in-memory stub for UI wiring) -------------------
class PersistedSuggestion(BaseModel):
    ok: Optional[bool] = True
    rule_id: Optional[int] = None
    id: int
    merchant: str
    category: str
    status: str = _Field("new", pattern=r"^(new|accepted|dismissed)$")
    count: Optional[int] = None
    window_days: Optional[int] = None
    # Extended fields from unified persisted table
    source: Optional[str] = None
    metrics_json: Optional[dict] = None
    last_mined_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class PersistedListResp(BaseModel):
    suggestions: List[PersistedSuggestion]

AUTOFILL_FROM_MINED = True

# --- Suggestion Ignores (DB-backed with small TTL cache) -------------------
class IgnorePair(BaseModel):
    merchant: str = Field(..., min_length=1, example="Starbucks")
    category: str = Field(..., min_length=1, example="Dining out")

class IgnoreListResp(BaseModel):
    ignores: List[IgnorePair] = Field(default_factory=list)

@router.get("/suggestions/ignores", response_model=IgnoreListResp, summary="List ignored (merchant, category) pairs")
def list_rule_suggestion_ignores(
    cached: bool = Query(True, description="Use short TTL cache for reads"),
    db: Session = Depends(get_db),
):
    rows = rsi_list_cached(db) if cached else rsi_list(db)
    return {"ignores": rows}

@router.post("/suggestions/ignores", response_model=IgnoreListResp, summary="Add an ignore pair", dependencies=[Depends(csrf_protect)])
def add_rule_suggestion_ignore(payload: IgnorePair, db: Session = Depends(get_db)):
    rows = rsi_add(db, payload.merchant.strip(), payload.category.strip())
    return {"ignores": rows}

@router.delete(
    "/suggestions/ignores/{merchant}/{category}",
    response_model=IgnoreListResp,
    summary="Remove an ignore pair"
)
def remove_rule_suggestion_ignore(
    merchant: str = Path(..., min_length=1),
    category: str = Path(..., min_length=1),
    db: Session = Depends(get_db),
):
    rows = rsi_remove(db, merchant.strip(), category.strip())
    return {"ignores": rows}

@router.get("/suggestions/persistent", response_model=PersistedListResp)
def list_persisted_suggestions_stub(
    window_days: int = Query(60, ge=7, le=180),
    min_count: int = Query(3, ge=2, le=20),
    max_results: int = Query(25, ge=1, le=100),
    autofill: bool = Query(True, description="If true and list is empty, auto-import from mined suggestions"),
    db: Session = Depends(get_db),
):
    if AUTOFILL_FROM_MINED and autofill:
        _db_upsert_from_mined(db, window_days, min_count, max_results)
    payload = _db_list_persisted(db)
    return {"suggestions": payload}


@router.post("/suggestions/{sid}/accept", response_model=PersistedSuggestion, dependencies=[Depends(csrf_protect)])
def accept_persisted_suggestion_db(sid: int, db: Session = Depends(get_db)):
    # First try persisted store
    try:
        out = _db_set_status(db, sid, "accepted")
        out["ok"] = True
        out["rule_id"] = None
        return out
    except ValueError:
        # Fallback: legacy suggestion accept creates a rule
        legacy = db.get(RuleSuggestion, sid) if hasattr(db, "get") else db.query(RuleSuggestion).get(sid)  # type: ignore[attr-defined]
        if not legacy:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        merchant = getattr(legacy, "merchant_norm", None) or getattr(legacy, "merchant", None) or ""
        category = getattr(legacy, "category", "")
        # Reuse legacy service to create rule & delete suggestion
        rid = rs.accept_suggestion(db, sid)
        if rid is None:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        # Return a shape compatible with persisted model for clients that expect it
        return {
            "ok": True,
            "rule_id": int(rid),
            "id": sid,
            "merchant": merchant,
            "category": category,
            "status": "accepted",
            "count": None,
            "window_days": None,
            "source": "mined",
            "metrics_json": None,
            "last_mined_at": None,
            "created_at": None,
            "updated_at": None,
        }


@router.post("/suggestions/{sid}/dismiss", response_model=PersistedSuggestion, dependencies=[Depends(csrf_protect)])
def dismiss_persisted_suggestion_db(sid: int, db: Session = Depends(get_db)):
    try:
        out = _db_set_status(db, sid, "dismissed")
        out["ok"] = True
        return out
    except ValueError:
        legacy = db.get(RuleSuggestion, sid) if hasattr(db, "get") else db.query(RuleSuggestion).get(sid)  # type: ignore[attr-defined]
        if not legacy:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        merchant = getattr(legacy, "merchant_norm", None) or getattr(legacy, "merchant", None) or ""
        category = getattr(legacy, "category", "")
        ok = rs.dismiss_suggestion(db, sid)
        if not ok:
            raise HTTPException(status_code=404, detail="Suggestion not found")
        return {
            "ok": True,
            "id": sid,
            "merchant": merchant,
            "category": category,
            "status": "dismissed",
            "count": None,
            "window_days": None,
            "source": "mined",
            "metrics_json": None,
            "last_mined_at": None,
            "created_at": None,
            "updated_at": None,
        }


@router.post("/suggestions/persistent/refresh", response_model=PersistedListResp, dependencies=[Depends(csrf_protect)])
def refresh_persisted_suggestions_db(
    window_days: int = Query(60, ge=7, le=180),
    min_count: int = Query(3, ge=2, le=20),
    max_results: int = Query(25, ge=1, le=100),
    clear_non_new: bool = Query(False, description="If true, drop accepted/dismissed before re-import"),
    db: Session = Depends(get_db),
):
    if clear_non_new:
        _db_clear_non_new(db)
    _db_upsert_from_mined(db, window_days, min_count, max_results)
    return {"suggestions": _db_list_persisted(db)}
