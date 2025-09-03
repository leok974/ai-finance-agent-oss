from fastapi import APIRouter
from typing import Dict
from collections import defaultdict

router = APIRouter()

@router.get("/report")
def report(month: str) -> Dict:
    from ..main import app
    cat_totals = defaultdict(float)
    for t in app.state.txns:
        if t["date"].startswith(month):
            cat_totals[t.get("category") or "Unknown"] += float(t["amount"])
    total = sum(cat_totals.values())
    rows = [{"category": c, "amount": round(v,2)} for c,v in sorted(cat_totals.items(), key=lambda x:-x[1])]
    return {"month": month, "total": round(total,2), "by_category": rows}
