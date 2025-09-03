from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict
from ..services.llm import LLMClient
from ..services.rules_engine import apply_rules

router = APIRouter()

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
async def suggest(month: str, limit: int = 50, topk: int = 3):
    from ..main import app
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
    return {"count": len(out), "results": out}
