from __future__ import annotations
from fastapi import APIRouter, Body, Query, Depends, HTTPException
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
import json, threading, os
from app.services.llm_flags import llm_policy

try:  # pragma: no cover - optional dependency
    from prometheus_client import Counter  # type: ignore
except Exception:  # pragma: no cover - prometheus not installed
    Counter = None

if Counter:
    _HELP_DESCRIBE_REQUESTS = Counter(
        "help_describe_requests_total",
        "Help describe requests",
        labelnames=("rephrase", "source"),
    )
    _HELP_DESCRIBE_REPHRASED = Counter(
        "help_describe_rephrased_total",
        "Help describe responses that were rephrased",
        labelnames=("provider",),
    )
else:
    _HELP_DESCRIBE_REQUESTS = None
    _HELP_DESCRIBE_REPHRASED = None

router = APIRouter()

class DescribeRequest(BaseModel):
    month: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None
    data: Optional[Any] = None  # tiny preview slice
    rephrase: Optional[bool] = None

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

# Explicit export (shim removed)
__all__ = ["describe_panel"]


def _record_metrics(rephrase_requested: bool, provider: Optional[str], rephrased: bool, cached: bool) -> None:
    provider_name = (provider or "none").strip() or "none"
    if _HELP_DESCRIBE_REQUESTS:
        _HELP_DESCRIBE_REQUESTS.labels(
            rephrase="1" if rephrase_requested else "0",
            source="cache" if cached else "fresh",
        ).inc()
    if rephrased and _HELP_DESCRIBE_REPHRASED:
        _HELP_DESCRIBE_REPHRASED.labels(provider=provider_name).inc()

@router.post("/agent/describe/{panel_id}")
def describe_panel(
    panel_id: str,
    req: DescribeRequest = Body(default=DescribeRequest()),
    rephrase_q: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    # Body flag wins when explicitly provided; otherwise fall back to query/default.
    body_fields = getattr(req, "model_fields_set", getattr(req, "__fields_set__", set()))
    body_has_rephrase = "rephrase" in body_fields
    if body_has_rephrase:
        rephrase = bool(req.rephrase) if req.rephrase is not None else settings.HELP_REPHRASE_DEFAULT
    elif rephrase_q is not None:
        rephrase = bool(rephrase_q)
    else:
        rephrase = settings.HELP_REPHRASE_DEFAULT

    fhash = hash_filters(req.filters)
    key = help_cache.make_key(panel_id, req.month, fhash, bool(rephrase))
    cached = help_cache.get(key)
    if cached and not (rephrase and cached.get("rephrased") is False):
        cached.setdefault("provider", "none")
        cached.setdefault("panel_id", panel_id)
        cached["rephrased"] = bool(cached.get("rephrased", False))
        _record_metrics(bool(rephrase), cached.get("provider"), cached["rephrased"], cached=True)
        return cached

    base = _deterministic(panel_id, req, db)
    text = base
    provider = "none"
    was_rephrased = False

    pol = _policy()
    allow_effective = bool(pol.get("allow"))
    # Test override: FORCE_HELP_LLM, highest precedence
    ov = os.getenv("FORCE_HELP_LLM")
    if ov is not None:
        v = ov.strip().lower()
        if v in {"1","true","yes","on"}:
            allow_effective = True
        elif v in {"0","false","no","off"}:
            allow_effective = False
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

    out = {
        "text": text,
        "grounded": True,
        "rephrased": bool(was_rephrased),
        "provider": provider or "none",
        "panel_id": panel_id,
    }
    help_cache.set_(key, out)
    _record_metrics(bool(rephrase), out["provider"], out["rephrased"], cached=False)
    return out


@router.get("/help/describe")
def describe_help_get_hint():
    raise HTTPException(status_code=405, detail="Use POST /agent/describe/{panel_id}")


# Backwards/forwards compatibility aliases
router.add_api_route("/api/agent/describe/{panel_id}", describe_panel, methods=["POST"])


@router.get("/api/help/describe")
def describe_help_get_hint_api():
    raise HTTPException(status_code=405, detail="Use POST /agent/describe/{panel_id}")
