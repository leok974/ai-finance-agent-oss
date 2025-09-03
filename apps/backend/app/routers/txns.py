from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db import get_db
from ..models import Txn, CategorizeRequest
from app.orm_models import Transaction
from ..utils.dates import latest_month_from_txns
from ..utils.state import save_state

router = APIRouter()

def month_of(date_str: str) -> str:
    return date_str[:7] if date_str else ""

@router.get("/unknowns")
def get_unknowns(month: Optional[str] = None) -> Dict[str, Any]:
    """
    Return unknown (uncategorized) transactions for the given month.
    If `month` is omitted, default to the latest month present in memory.
    Response shape matches the web client: {"month": "...", "unknowns": [Txn, ...]}.
    """
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
