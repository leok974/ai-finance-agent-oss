from fastapi import APIRouter, HTTPException
from ..services.explain import build_explanation

router = APIRouter()

@router.get("/{txn_id}/explain")
def explain(txn_id: int):
    from ..main import app
    t = next((x for x in app.state.txns if x["id"] == txn_id), None)
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    # In a full flow you'd retrieve cached suggestions; here we just show rule + placeholder
    applied_rule = None
    for r in app.state.rules:
        if r["pattern"].lower() in (t.get(r["target"]) or "").lower():
            applied_rule = r
            break
    text = build_explanation(t, suggestions=[{"category": t.get("category","Unknown"), "confidence": 0.9}], applied_rule=applied_rule)
    return {"explain": text}
