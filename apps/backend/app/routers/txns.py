from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from ..models import Txn, CategorizeRequest
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
def categorize(txn_id: int, req: CategorizeRequest):
    from ..main import app
    for t in getattr(app.state, "txns", []):
        if t["id"] == txn_id:
            t["category"] = req.category
            # Track supervision for future training
            app.state.user_labels.append({"txn_id": txn_id, "category": req.category})
            save_state(app)
            return {"ok": True, "txn": t}
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
def get_unknown(month: Optional[str] = None) -> List[Txn]:
    """
    Legacy alias that returns a plain list [Txn, ...]. Prefer /txns/unknowns.
    """
    data = get_unknowns(month)
    # data is { month: str, unknowns: List[Txn] }
    return data.get("unknowns", [])
