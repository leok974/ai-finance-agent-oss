
from fastapi import APIRouter, Depends, Query
import json, urllib.request

# ensure we have a router to attach endpoints to
router = APIRouter()

@router.get("/status")
def ml_status():
    """Check if Ollama is running and which models are available."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=1.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            models = []
            if isinstance(data, dict) and isinstance(data.get("models"), list):
                for m in data["models"]:
                    name = (m or {}).get("name")
                    if name:
                        models.append(name)
            return {"ok": True, "models": models}
    except Exception as e:
        return {"ok": False, "error": str(e)}

from fastapi import HTTPException
from typing import List, Dict, Optional
from ..services.llm import LLMClient
from ..services.rules_engine import apply_rules
from ..utils.dates import latest_month_from_txns
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import Transaction

def dedup_and_topk(items: List[Dict], k: int = 3) -> List[Dict]:
    seen = set()
    out = []
    for s in items:
        cat = s.get("category")
        if not cat:
            continue
        key = cat.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"category": cat.strip(), "confidence": float(s.get("confidence", 0.0))})
        if len(out) >= k:
            break
    return out

def _latest_month_str(db: Session) -> Optional[str]:
    """Return YYYY-MM for the latest transaction date, or None."""
    max_d = db.execute(select(func.max(Transaction.date))).scalar()
    return max_d.strftime("%Y-%m") if max_d else None


def to_txn_dict(t: Transaction) -> dict:
    return {
        "id": t.id,
        "date": t.date.isoformat() if getattr(t, "date", None) else None,
        "merchant": t.merchant,
        "description": t.description,
        "amount": float(t.amount) if t.amount is not None else 0.0,
        "category": t.category,
        "account": t.account,
        "month": t.month,
    }


@router.get("/suggest")
async def suggest(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    limit: int = 50,
    topk: int = 3,
    db: Session = Depends(get_db),
):
    """
    Return ML/rule-based suggestions for transactions in a month. If `month` is omitted,
    default to the latest month available. Response includes both legacy fields and
    a top-level `month` and `suggestions` for forward compatibility.
    """
    from ..main import app
    if not month:
        # Prefer DB if available; fall back to in-memory test data
        month = _latest_month_str(db)
        if not month:
            month = latest_month_from_txns(getattr(app.state, "txns", []))
        if not month:
            return {"month": None, "count": 0, "results": [], "suggestions": []}

    rows = (
        db.execute(
            select(Transaction)
            .where(
                Transaction.month == month,
                or_(
                    Transaction.category.is_(None),
                    Transaction.category == "",
                    Transaction.category == "Unknown",
                ),
            )
            .order_by(Transaction.date.desc(), Transaction.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    items = [to_txn_dict(t) for t in rows]
    llm = LLMClient()
    out = []
    for t in items:
        # try rules first
        cat = apply_rules(t, app.state.rules)
        suggestions = []
        if cat:
            suggestions.append({"category": cat, "confidence": 0.99})
        # ask llm
        llm_sug = await llm.suggest_categories(t)
        suggestions.extend(llm_sug or [])
        suggestions = sorted(suggestions, key=lambda x: -float(x.get("confidence", 0.0)))
        suggestions = dedup_and_topk(suggestions, k=topk)
        out.append({"txn": t, "suggestions": suggestions})
    # Backward + forward compatible shape
    return {
        "month": month,
        "count": len(out),
        "results": out,
        "suggestions": out,
    }
