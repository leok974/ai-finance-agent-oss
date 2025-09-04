from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional
from ..utils.dates import latest_month_from_txns

router = APIRouter()

# Simple in-memory example
BUDGETS = {
    "Groceries": 400.0,
    "Dining": 150.0,
    "Transport": 200.0,
}

@router.get("/list")
def list_budgets() -> Dict[str, float]:
    return BUDGETS

@router.get("/check")
def budget_check(month: Optional[str] = None) -> List[Dict]:
    from ..main import app
    if not month:
        txns = getattr(app.state, "txns", [])
        month = latest_month_from_txns(txns)
        if not month:
            return []
    spent = {}
    for t in app.state.txns:
        if t["date"].startswith(month):
            c = t.get("category") or "Unknown"
            spent[c] = spent.get(c, 0.0) + float(t["amount"])
    rows = []
    for cat, limit in BUDGETS.items():
        s = spent.get(cat, 0.0)
        rows.append({"category": cat, "spent": round(s,2), "limit": limit, "over": round(max(0.0, s - limit),2)})
    return rows
