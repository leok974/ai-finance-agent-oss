from fastapi import APIRouter, HTTPException
from typing import List, Optional
from ..models import Txn, CategorizeRequest

router = APIRouter()

def month_of(date_str: str) -> str:
    return date_str[:7] if date_str else ""

@router.get("/unknown")
def get_unknown(month: Optional[str] = None) -> List[Txn]:
    from ..main import app
    items = app.state.txns
    if month:
        items = [t for t in items if month_of(t["date"]) == month]
    return [Txn(**t) for t in items if (t.get("category") or "Unknown") == "Unknown"]

@router.post("/{txn_id}/categorize")
def categorize(txn_id: int, req: CategorizeRequest):
    from ..main import app
    for t in app.state.txns:
        if t["id"] == txn_id:
            t["category"] = req.category
            # Track supervision for future training
            app.state.user_labels.append({"txn_id": txn_id, "category": req.category})
            return {"ok": True, "txn": t}
    raise HTTPException(status_code=404, detail="Transaction not found")
