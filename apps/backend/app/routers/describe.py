from __future__ import annotations
from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, Optional
from app.db import get_db
from sqlalchemy.orm import Session
from app.config import settings
import app.services.agent_detect as agent_detect
from app.utils import llm as llm_mod
from app.analytics_emit import emit_fallback
from app.services import help_cache
from app.utils.filters import hash_filters
import json, threading
from app.services.llm_flags import llm_policy

router = APIRouter()

class DescribeRequest(BaseModel):
    month: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None
    data: Optional[Any] = None  # tiny preview slice

## cache now handled by app.services.help_cache

def _deterministic(panel_id: str, req: DescribeRequest, db: Session) -> str:
    # Minimal deterministic descriptions. Extend with panel-specific logic.
    month = req.month or "(current month)"
    if panel_id in {"overview.metrics.totalSpend", "total_spend"}:
        return f"Total spend shows all outgoing amounts for {month}."
    if panel_id.startswith("anomalies"):
        return f"Highlights categories with unusual spend in {month} vs recent baseline."
    if panel_id.startswith("cards.insights"):
        return f"Narrative insights derived from your transactions for {month}."
    if panel_id.startswith("top_categories"):
        return f"Top categories ranked by spend for {month}."
    if panel_id.startswith("top_merchants"):
        return f"Top merchants ranked by spend for {month}."
    return f"Contextual help for {panel_id} in {month}."

def _summarize_for_prompt(data: Any) -> str:
    try:
        if data is None:
            return "(no data)"
        if isinstance(data, list):
            if not data:
                return "(empty list)"
            # show up to first 3 rows (simple projection)
            sample = data[:3]
            return json.dumps(sample, default=str)
        if isinstance(data, dict):
            keys = list(data.keys())[:8]
            return json.dumps({k: data[k] for k in keys}, default=str)
        return str(data)[:400]
    except Exception:
        return "(unavailable)"

def _policy():
    return llm_policy("help")

# Backward compatibility shim for legacy tests that monkeypatch `_llm_enabled`.
# Tests set this to True/False to force rephrase path. We OR it with the normal
# policy decision instead of mutating internal policy state.
def _llm_enabled() -> bool:  # pragma: no cover - shim used mainly in tests
    try:
        return llm_policy("help").get("allow", False)
    except Exception:
        return False

# Explicit export for tests performing attribute lookup before import side-effects
__all__ = ["describe_panel", "_llm_enabled"]

@router.post("/agent/describe/{panel_id}")
def describe_panel(panel_id: str, req: DescribeRequest, rephrase: Optional[bool] = Query(None), db: Session = Depends(get_db)):
    # decide default
    if rephrase is None:
        rephrase = settings.HELP_REPHRASE_DEFAULT

    fhash = hash_filters(req.filters)
    key = help_cache.make_key(panel_id, req.month, fhash, bool(rephrase))
    cached = help_cache.get(key)
    if cached and not (rephrase and cached.get("rephrased") is False):
        return cached

    base = _deterministic(panel_id, req, db)
    text = base
    provider = "none"
    was_rephrased = False

    pol = _policy()
    allow_effective = bool(pol.get("allow"))
    try:
        allow_effective = allow_effective or bool(_llm_enabled())
    except Exception:
        pass
    if pol.get("globally_disabled"):
        try:
            help_cache.clear()
        except Exception:
            pass

    if rephrase and allow_effective:
        getattr(llm_mod, 'reset_fallback_provider', lambda: None)()
        new_text = agent_detect.try_llm_rephrase_summary(panel_id, {"intent": panel_id, "filters": req.filters, "result": req.data}, base)  # type: ignore
        fb = getattr(llm_mod, 'get_last_fallback_provider', lambda: None)()
        if new_text and new_text.strip():
            cleaned = new_text.strip()
            if cleaned != base or cleaned.startswith("[polished]"):
                text = cleaned
                was_rephrased = True
        if fb:
            provider = f"fallback-{fb}"
        else:
            provider = "primary" if was_rephrased else "none"
        def _emit():
            try:
                emit_fallback({"rid": key[:12], "provider": provider, "requested_model": getattr(settings, 'DEFAULT_LLM_MODEL', 'gpt-oss:20b'), "fallback_model": getattr(settings, 'DEFAULT_LLM_MODEL', 'gpt-oss:20b')})
            except Exception:
                pass
        threading.Thread(target=_emit, daemon=True).start()

    out = {"text": text, "grounded": True, "rephrased": was_rephrased, "provider": provider}
    help_cache.set_(key, out)
    return out
