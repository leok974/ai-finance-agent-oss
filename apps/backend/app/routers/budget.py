from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional, Literal
from fastapi import Depends, Query, Path
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from app.db import get_db
from app.services.budget_recommend import compute_recommendations
from pydantic import BaseModel, Field, RootModel, ConfigDict
from app.orm_models import Budget, Transaction
from app.utils.state import TEMP_BUDGETS, current_month_key
from app.utils.csrf import csrf_protect

router = APIRouter()
# Separate router exposing "/budgets" prefix for temp budget overlay endpoints
temp_router = APIRouter(prefix="/budgets", tags=["budgets"])


class BudgetListResp(RootModel[Dict[str, float]]):
    pass


@router.get(
    "/list",
    response_model=BudgetListResp,
    summary="List persisted budgets (category->amount)",
)
def list_budgets(db: Session = Depends(get_db)) -> Dict[str, float]:
    rows = db.query(Budget.category, Budget.amount).all()
    return {cat: float(amt) for cat, amt in rows}


class BudgetCheckItem(BaseModel):
    category: str
    spent: float
    limit: float
    over: float


@router.get(
    "/check",
    response_model=List[BudgetCheckItem],
    summary="Compare current month spend vs budget caps",
)
def budget_check(
    month: Optional[str] = None, db: Session = Depends(get_db)
) -> List[Dict]:
    # Resolve month (YYYY-MM) from DB if not provided
    if not month:
        max_dt = db.query(func.max(Transaction.date)).scalar()
        if not max_dt:
            return []
        month = f"{max_dt.year:04d}-{max_dt.month:02d}"

    # Load budgets from DB
    budgets = {
        cat: float(amt) for cat, amt in db.query(Budget.category, Budget.amount).all()
    }
    if not budgets:
        return []

    # Compute spent per category for the month (expenses as positive magnitude)
    start_y, start_m = map(int, month.split("-"))
    start_date = date(start_y, start_m, 1)
    end_date = date(
        start_y + (1 if start_m == 12 else 0), (1 if start_m == 12 else start_m + 1), 1
    )
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
        out.append(
            {
                "category": cat,
                "spent": round(s, 2),
                "limit": round(limit, 2),
                "over": round(max(0.0, s - float(limit)), 2),
            }
        )
    return out


class ApplyReq(BaseModel):
    strategy: Literal["median", "p75", "median_plus_10"] = "median"
    categories_include: Optional[List[str]] = None
    categories_exclude: Optional[List[str]] = None
    months: int = 6


class BudgetRecommendation(BaseModel):
    category: str
    median: float
    p75: float
    avg: float
    sample_size: int
    current_month: float | None = None
    over_p75: bool | None = None


class BudgetRecsResp(BaseModel):
    months: int
    recommendations: List[BudgetRecommendation]


@router.get(
    "/recommendations",
    response_model=BudgetRecsResp,
    summary="Compute per-category budget suggestions from history",
)
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


class BudgetApplyResp(BaseModel):
    ok: bool = True
    applied: List[Dict]
    applied_count: int
    applied_total: float


@router.post(
    "/apply",
    response_model=BudgetApplyResp,
    summary="Upsert budgets for selected categories using a strategy",
    dependencies=[Depends(csrf_protect)],
)
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

    applied = [{"category": c, "amount": a} for c, a in picked]
    total = round(sum(a for _, a in picked), 2) if picked else 0.0
    return {
        "ok": True,
        "applied": applied,
        "applied_count": len(applied),
        "applied_total": total,
    }


# --- Focused setter: upsert a single budget category cap ---
class BudgetSetReq(BaseModel):
    category: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)


@router.post("/set", dependencies=[Depends(csrf_protect)])
def set_budget(req: BudgetSetReq, db: Session = Depends(get_db)):
    cat = req.category.strip()
    amt = float(req.amount)
    if not cat:
        raise HTTPException(status_code=400, detail="category required")
    if not (amt > 0):
        raise HTTPException(status_code=400, detail="amount must be > 0")

    obj = db.query(Budget).filter(Budget.category == cat).one_or_none()
    if obj:
        obj.amount = amt
    else:
        obj = Budget(category=cat, amount=amt)
        db.add(obj)

    db.commit()
    db.refresh(obj)
    return {
        "ok": True,
        "budget": {
            "category": obj.category,
            "amount": round(obj.amount or 0.0, 2),
            "updated_at": (
                str(getattr(obj, "updated_at", None))
                if hasattr(obj, "updated_at")
                else None
            ),
        },
    }


@router.delete("/{category}", dependencies=[Depends(csrf_protect)])
def delete_budget(
    category: str = Path(..., min_length=1),
    db: Session = Depends(get_db),
):
    cat = category.strip()
    if not cat:
        raise HTTPException(status_code=400, detail="category required")

    row = db.query(Budget).filter(Budget.category == cat).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Budget not found for {cat}")

    prev_amount = float(row.amount or 0.0)
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted": {"category": cat, "amount": round(prev_amount, 2)}}


# ------------------ Temporary Budgets (in-memory overlay) --------------------
class TempBudgetReq(BaseModel):
    category: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    month: str | None = None  # "YYYY-MM" optional; default to current


# Mount under both /budget/temp (legacy) and /budgets/temp (new)
class TempBudgetItem(BaseModel):
    month: str = Field(..., json_schema_extra={"examples": ["2025-09"]})
    category: str = Field(..., json_schema_extra={"examples": ["Groceries"]})
    amount: float = Field(..., json_schema_extra={"examples": [500.0]})


class TempBudgetResp(BaseModel):
    ok: bool = True
    temp_budget: TempBudgetItem


class TempBudgetListResp(BaseModel):
    month: str = Field(..., json_schema_extra={"examples": ["2025-09"]})
    items: list[TempBudgetItem] = Field(default_factory=list)


class TempBudgetDeleteResp(BaseModel):
    ok: bool = True
    deleted: dict


@router.post(
    "/temp",
    response_model=TempBudgetResp,
    summary="Set temporary budget overlay (in-memory)",
)
def set_temp_budget(req: TempBudgetReq, db: Session = Depends(get_db)):
    """
    Set a temporary budget overlay for a given category and month.

    Notes:
    - This does not persist to the database; it's stored in-memory (process-level) only.
    - Useful for "try it out" flows; to have overlays affect reads, merge them in your read path later.
    """
    month = req.month or current_month_key()
    key = (month, req.category.strip())
    TEMP_BUDGETS[key] = float(req.amount)
    return {
        "ok": True,
        "temp_budget": {
            "month": month,
            "category": key[1],
            "amount": TEMP_BUDGETS[key],
        },
    }


@router.get(
    "/temp", response_model=TempBudgetListResp, summary="List temporary budget overlays"
)
def list_temp_budgets(month: str | None = Query(None)):
    """
    List temporary budget overlays for the selected month (default: current month).

    Overlays are in-memory only; restarting the app clears them.
    """
    m = month or current_month_key()
    items = [
        {"month": mm, "category": cat, "amount": amt}
        for (mm, cat), amt in TEMP_BUDGETS.items()
        if mm == m
    ]
    return {"month": m, "items": items}


@router.delete(
    "/temp/{category}",
    response_model=TempBudgetDeleteResp,
    summary="Clear a temporary budget overlay",
)
def clear_temp_budget(
    category: str = Path(..., min_length=1), month: str | None = Query(None)
):
    """
    Remove a temporary budget overlay for this category/month.

    This is in-memory only and has no impact on DB-backed budgets.
    """
    m = month or current_month_key()
    key = (m, category.strip())
    existed = key in TEMP_BUDGETS
    amt = float(TEMP_BUDGETS.get(key, 0.0))
    if existed:
        del TEMP_BUDGETS[key]
    return {
        "ok": True,
        "deleted": {"month": m, "category": key[1], "amount": amt, "existed": existed},
    }


# Duplicate endpoints on temp_router at /budgets/temp for test expectations
@temp_router.post("/temp", response_model=TempBudgetResp)
def set_temp_budget_budgets(req: TempBudgetReq, db: Session = Depends(get_db)):
    return set_temp_budget(req, db)


@temp_router.get("/temp", response_model=TempBudgetListResp)
def list_temp_budgets_budgets(month: str | None = Query(None)):
    return list_temp_budgets(month)


@temp_router.delete("/temp/{category}", response_model=TempBudgetDeleteResp)
def clear_temp_budget_budgets(
    category: str = Path(..., min_length=1), month: str | None = Query(None)
):
    return clear_temp_budget(category, month)


# ------------------ Read budgets with optional overlay merge -----------------
class BudgetSetReq(BaseModel):
    category: str = Field(
        ...,
        min_length=1,
        description="Budget category",
        json_schema_extra={"examples": ["Groceries"]},
    )
    amount: float = Field(
        ...,
        gt=0,
        description="New persistent budget cap",
        json_schema_extra={"examples": [450.00]},
    )


class BudgetSetResp(BaseModel):
    ok: bool = True
    budget: dict


class BudgetReadItem(BaseModel):
    category: str = Field(..., json_schema_extra={"examples": ["Groceries"]})
    base_amount: Optional[float] = Field(
        None, description="DB budget (if any)", json_schema_extra={"examples": [450.0]}
    )
    temp_overlay: Optional[float] = Field(
        None, description="Overlay (if merged)", json_schema_extra={"examples": [500.0]}
    )
    effective_amount: Optional[float] = Field(
        None,
        description="temp if present else base",
        json_schema_extra={"examples": [500.0]},
    )
    source: Literal["temp", "db", "none"] = Field(
        ..., description="Effective source", json_schema_extra={"examples": ["temp"]}
    )


class BudgetReadResp(BaseModel):
    month: str = Field(..., json_schema_extra={"examples": ["2025-09"]})
    merge_temp: bool = Field(..., description="Were overlays merged?")
    count: int = Field(..., json_schema_extra={"examples": [3]})
    items: list[BudgetReadItem]

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "month": "2025-09",
                    "merge_temp": True,
                    "count": 3,
                    "items": [
                        {
                            "category": "Dining out",
                            "base_amount": None,
                            "temp_overlay": 200.0,
                            "effective_amount": 200.0,
                            "source": "temp",
                        },
                        {
                            "category": "Groceries",
                            "base_amount": 450.0,
                            "temp_overlay": 500.0,
                            "effective_amount": 500.0,
                            "source": "temp",
                        },
                        {
                            "category": "Transport",
                            "base_amount": 160.0,
                            "temp_overlay": None,
                            "effective_amount": 160.0,
                            "source": "db",
                        },
                    ],
                }
            ]
        }
    )


@router.get(
    "/read",
    response_model=BudgetReadResp,
    summary="Read budgets with optional temp overlay merge",
)
def read_budgets(
    month: Optional[str] = Query(
        None, description='Month key "YYYY-MM". Defaults to current.'
    ),
    merge_temp: bool = Query(
        False, description="If true, merge in-memory temp overlays."
    ),
    include: Optional[str] = Query(
        None, description="Comma-separated categories to include."
    ),
    exclude: Optional[str] = Query(
        None, description="Comma-separated categories to exclude."
    ),
    db: Session = Depends(get_db),
):
    """
    Read DB-backed budgets. If `merge_temp=true`, overlay in-memory temp budgets
    (process-level) for the requested month.

    Response item fields:
    - category: category name
    - base_amount: DB amount (or null if not present)
    - temp_overlay: overlay amount for this month (if merge_temp && present)
    - effective_amount: temp_overlay if present else base_amount (may be null)
    - source: "temp" | "db" | "none"
    """
    m = month or current_month_key()

    inc = set([s.strip() for s in include.split(",") if s.strip()]) if include else None
    exc = (
        set([s.strip() for s in exclude.split(",") if s.strip()]) if exclude else set()
    )

    rows = db.query(Budget).order_by(Budget.category.asc()).all()

    def keep(cat: str) -> bool:
        if inc and cat not in inc:
            return False
        if cat in exc:
            return False
        return True

    items = []
    for b in rows:
        if not keep(b.category):
            continue
        base = float(b.amount or 0.0)
        has_overlay = merge_temp and (m, b.category) in TEMP_BUDGETS
        overlay = float(TEMP_BUDGETS.get((m, b.category), 0.0)) if has_overlay else 0.0
        eff = overlay if has_overlay else base if b.amount is not None else None
        items.append(
            {
                "category": b.category,
                "base_amount": round(base, 2) if b.amount is not None else None,
                "temp_overlay": round(overlay, 2) if has_overlay else None,
                "effective_amount": round(eff, 2) if eff is not None else None,
                "source": "temp" if has_overlay else "db",
            }
        )

    if merge_temp:
        for (mm, cat), amt in TEMP_BUDGETS.items():
            if mm != m:
                continue
            if not keep(cat):
                continue
            if any(it["category"] == cat for it in items):
                continue
            val = round(float(amt or 0.0), 2)
            items.append(
                {
                    "category": cat,
                    "base_amount": None,
                    "temp_overlay": val,
                    "effective_amount": val,
                    "source": "temp",
                }
            )

    items.sort(key=lambda r: r["category"].lower())

    return {
        "month": m,
        "merge_temp": merge_temp,
        "count": len(items),
        "items": items,
    }


# Expose same read under /budgets/read as well
@temp_router.get("/read", response_model=BudgetReadResp)
def read_budgets_budgets(
    month: Optional[str] = Query(
        None, description='Month key "YYYY-MM". Defaults to current.'
    ),
    merge_temp: bool = Query(
        False, description="If true, merge in-memory temp overlays."
    ),
    include: Optional[str] = Query(
        None, description="Comma-separated categories to include."
    ),
    exclude: Optional[str] = Query(
        None, description="Comma-separated categories to exclude."
    ),
    db: Session = Depends(get_db),
):
    return read_budgets(month, merge_temp, include, exclude, db)
