
from fastapi import APIRouter
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

from fastapi import HTTPException, Query
from typing import List, Dict, Optional
from ..services.llm import LLMClient
from ..services.rules_engine import apply_rules
from ..utils.dates import latest_month_from_txns

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

@router.get("/suggest")
async def suggest(month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"), limit: int = 50, topk: int = 3):
    """
    Return ML/rule-based suggestions for transactions in a month. If `month` is omitted,
    default to the latest month available. Response includes both legacy fields and
    a top-level `month` and `suggestions` for forward compatibility.
    """
    from ..main import app
    if not month:
        txns = getattr(app.state, "txns", [])
        month = latest_month_from_txns(txns)
        if not month:
            return {"month": None, "count": 0, "results": [], "suggestions": []}
    items = [t for t in app.state.txns if t["date"].startswith(month) and (t.get("category") or "Unknown") == "Unknown"]
    items = items[:limit]
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
