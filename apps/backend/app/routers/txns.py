from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db import get_db
from app.config import settings
from sqlalchemy import desc
from sqlalchemy import text
from sqlalchemy import func
from ..models import Txn, CategorizeRequest
from app.orm_models import Transaction
from ..utils.dates import latest_month_from_txns
from ..utils.state import save_state
import datetime as dt
from pydantic import BaseModel
from app.services.rules_apply import apply_all_active_rules, latest_month_from_data

router = APIRouter()

def month_of(date_str: str) -> str:
    if not date_str:
        return ""
    try:
        # Parse date string and use strftime for consistent formatting
        date_obj = dt.date.fromisoformat(date_str[:10])
        return date_obj.strftime("%Y-%m")
    except (ValueError, TypeError):
        # Fallback to string slicing for malformed dates
        return date_str[:7] if len(date_str) >= 7 else ""

@router.get("/unknowns")
def get_unknowns(month: Optional[str] = None, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Return unknown (uncategorized) transactions for the given month using DB ids.
    If `month` is omitted, try to default from DB; fall back to in-memory state.
    Response shape matches the web client: {"month": "...", "unknowns": [Txn, ...]}.
    """
    # Prefer DB-backed unknowns to ensure real ids
    try:
        if not month:
            # try to derive latest month from DB
            m = latest_month_from_data(db)
            if m:
                month = m
        if month:
            unlabeled = (
                (Transaction.category.is_(None)) |
                (func.trim(Transaction.category) == "") |
                (func.lower(Transaction.category) == "unknown")
            )
            rows = (
                db.query(Transaction)
                .filter(Transaction.month == month)
                .filter(unlabeled)
                .order_by(desc(Transaction.date), desc(Transaction.id))
                .all()
            )
            unknowns: List[Txn] = []
            for r in rows:
                try:
                    unknowns.append(
                        Txn(
                            id=r.id,
                            date=r.date.isoformat() if r.date else "",
                            merchant=r.merchant or "",
                            description=r.description or "",
                            amount=float(r.amount or 0.0),
                            category=(r.category or "Unknown"),
                        )
                    )
                except Exception:
                    continue
            return {"month": month, "unknowns": unknowns}
    except Exception:
        # fall through to in-memory fallback
        pass

    # Fallback: in-memory list if DB path not available
    from ..main import app
    items = getattr(app.state, "txns", [])
    if not items:
        return {"month": None, "unknowns": []}
    if not month:
        month = latest_month_from_txns(items)
        if not month:
            return {"month": None, "unknowns": []}
    month_items = [t for t in items if month_of(t.get("date", "")) == month]
    unknowns = [Txn(**t) for t in month_items if (t.get("category") or "Unknown") == "Unknown"]
    return {"month": month, "unknowns": unknowns}

@router.post("/{txn_id}/categorize")
def categorize(txn_id: int, req: CategorizeRequest, db: Session = Depends(get_db)):
    # Update DB if present
    tdb = db.get(Transaction, txn_id)
    if tdb:
        tdb.category = req.category
        db.commit()
        db.refresh(tdb)
        # Feedback logging (best-effort): raw SQL to ensure training signal is captured
        try:
            db.execute(
                text("insert into feedback (txn_id, label, source, notes) values (:tid, :label, 'user_change', '')"),
                {"tid": tdb.id, "label": req.category},
            )
            db.commit()
        except Exception:
            pass
    # Also update in-memory for compatibility
    from ..main import app
    for t in getattr(app.state, "txns", []):
        if t["id"] == txn_id:
            t["category"] = req.category
            app.state.user_labels.append({"txn_id": txn_id, "category": req.category})
            save_state(app)
            # Prefer returning the in-memory dict shape used by clients
            return {"ok": True, "txn": t}
    # If not found in memory but present in DB, return DB-mapped shape
    if tdb:
        return {"ok": True, "txn": to_txn_dict(tdb)}
    raise HTTPException(status_code=404, detail="Transaction not found")

@router.post("/categorize")
def categorize_body(req: Dict[str, Any]):
    """
    Compatibility endpoint to accept {"id": <number>, "category": <string>} in the body.
    Mirrors the path-param version for clients that post without a URL id.
    """
    txn_id = req.get("id")
    category = req.get("category")
    if txn_id is None or not category:
        raise HTTPException(status_code=422, detail="Provide 'id' and 'category'")
    return categorize(int(txn_id), CategorizeRequest(category=category))

# --- Backward compatibility routes ---
@router.get("/unknown")
def get_unknown(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
) -> List[Txn]:
    """Legacy alias returning a plain list [Txn, ...]; DB-backed."""
    rows = (
        db.execute(
            select(Transaction)
            .where(Transaction.month == month, (Transaction.category.is_(None)))
            .order_by(Transaction.date.desc(), Transaction.id.desc())
        )
        .scalars()
        .all()
    )
    # map to pydantic Txn list
    txns: List[Txn] = []
    for r in rows:
        try:
            txns.append(
                Txn(
                    id=r.id,
                    date=r.date.isoformat() if r.date else "",
                    merchant=r.merchant or "",
                    description=r.description or "",
                    amount=float(r.amount or 0.0),
                    category=(r.category or "Unknown"),
                )
            )
        except Exception:
            continue
    return txns


def to_txn_dict(t: Transaction) -> Dict[str, Any]:
    return {
        "id": t.id,
        "date": t.date.isoformat() if t.date else "",
        "merchant": t.merchant,
        "description": t.description,
        "amount": t.amount,
        "category": t.category or "Unknown",
        "account": getattr(t, "account", None),
        "month": getattr(t, "month", None),
    }


# ------------------------ Extended operations -------------------------------
from pydantic import BaseModel, Field
from app.services.tx_ops import link_transfer, unlink_transfer, upsert_splits
from app.services.recurring import scan_recurring
from app.orm_models import TransferLink as TransferLinkORM, TransactionSplit as TransactionSplitORM, RecurringSeries as RecurringSeriesORM


# --- Transfers ---------------------------------------------------------------
class TransferIn(BaseModel):
    txn_out_id: int = Field(..., description="Outflow txn id (negative amount)")
    txn_in_id: int = Field(..., description="Inflow txn id (positive amount)")


@router.post("/mark_transfer")
def mark_transfer(payload: TransferIn, db: Session = Depends(get_db)):
    try:
        link = link_transfer(db, payload.txn_out_id, payload.txn_in_id)
        return {"status": "ok", "link_id": link.id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/transfer/{link_id}")
def delete_transfer(link_id: int, db: Session = Depends(get_db)):
    unlink_transfer(db, link_id)
    return {"status": "ok"}


# --- Splits ------------------------------------------------------------------
class SplitLeg(BaseModel):
    category: str
    amount: float
    note: Optional[str] = None


class SplitIn(BaseModel):
    legs: List[SplitLeg]


@router.post("/{txn_id}/split")
def create_or_replace_splits(txn_id: int, payload: SplitIn, db: Session = Depends(get_db)):
    try:
        legs = upsert_splits(db, txn_id, [l.dict() for l in payload.legs])
        return {"status": "ok", "count": len(legs)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{txn_id}/split/{split_id}")
def delete_split_leg(txn_id: int, split_id: int, db: Session = Depends(get_db)):
    leg = db.query(TransactionSplitORM).get(split_id)
    if not leg or leg.parent_txn_id != txn_id:
        raise HTTPException(status_code=404, detail="Split not found")
    db.delete(leg)
    db.commit()
    return {"status": "ok"}


# --- Recurring ---------------------------------------------------------------
class RecurringScanIn(BaseModel):
    month: Optional[str] = None


@router.post("/recurring/scan")
def recurring_scan(payload: RecurringScanIn, db: Session = Depends(get_db)):
    n = scan_recurring(db, month=payload.month)
    return {"status": "ok", "upserts": n}


@router.get("/recurring")
def recurring_list(db: Session = Depends(get_db)):
    items = db.query(RecurringSeriesORM).order_by(RecurringSeriesORM.merchant).all()
    out: List[Dict[str, Any]] = []
    for r in items:
        out.append(dict(
            id=r.id,
            merchant=r.merchant,
            avg_amount=float(r.avg_amount),
            cadence=r.cadence,
            first_seen=str(r.first_seen),
            last_seen=str(r.last_seen),
            next_due=str(r.next_due) if r.next_due else None,
            sample_txn_id=r.sample_txn_id,
        ))
    return out

# --- DEV helper: recent transactions (not available in prod) ---
@router.get("/recent")
def recent_txns(limit: int = Query(20, ge=1, le=200), db: Session = Depends(get_db)):
    """
    Return latest transactions (id, date, merchant, amount, category, month).
    Hidden in production. Useful for quickly grabbing txn_ids to test /agent/chat explain_txn.
    """
    if getattr(settings, "ENV", "dev") == "prod":
        # Hide in prod
        raise HTTPException(status_code=404, detail="Not found")

    rows = (
        db.query(Transaction)
        .order_by(desc(Transaction.date), desc(Transaction.id))
        .limit(limit)
        .all()
    )
    items = []
    for r in rows:
        items.append({
            "id": r.id,
            "date": r.date.isoformat() if r.date else "",
            "merchant": r.merchant,
            "amount": float(r.amount or 0.0),
            "category": r.category or "Unknown",
            "month": getattr(r, "month", None),
        })
    return {"items": items, "limit": limit}


# --- Bulk reclassify (apply active rules) -----------------------------------
class ReclassifyIn(BaseModel):
    month: Optional[str] = None


@router.post("/reclassify")
def reclassify(
    payload: Optional[ReclassifyIn] = None,
    month: Optional[str] = Query(None, description="YYYY-MM; defaults to latest if omitted"),
    db: Session = Depends(get_db),
):
    """
    Re-run categorization over transactions by applying all active rules.
    Defaults to latest month if not provided.
    """
    month = (month or (payload.month if payload else None) or latest_month_from_data(db))
    if not month:
        raise HTTPException(status_code=400, detail="No transactions available to determine month")

    applied, skipped, details = apply_all_active_rules(db, month)
    return {"status": "ok", "month": month, "applied": applied, "skipped": skipped, "details": details}
