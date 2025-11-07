from __future__ import annotations
from fastapi import APIRouter, Body, Query, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, Literal, List
from app.db import get_db
from sqlalchemy.orm import Session
from app.config import settings
import app.services.agent_detect as agent_detect
from app.utils import llm as llm_mod
from app.analytics_emit import emit_fallback
from app.services import help_cache
from app.utils.filters import hash_filters
from app.deps.auth_guard import get_current_user_id
import json
import threading
import os
import logging
from app.services.llm_flags import llm_policy
from app.metrics import (
    help_describe_requests,
    help_describe_rephrased,
    help_describe_fallbacks,
)
from app.services.help_copy import get_static_help_for_panel
from app.services.explain import explain_month_merchants

router = APIRouter()
logger = logging.getLogger(__name__)

ModeType = Literal["learn", "explain"]


class DescribeRequest(BaseModel):
    month: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None
    data: Optional[Any] = None  # tiny preview slice
    rephrase: Optional[bool] = Field(
        default=None, description="Back-compat flag for explain mode"
    )
    mode: Optional[ModeType] = Field(
        default=None, description='Explicitly request "learn" or "explain" mode'
    )


## cache now handled by app.services.help_cache


def _deterministic(
    panel_id: str, req: DescribeRequest, user_id: int, db: Session
) -> str:
    """
    Deterministic descriptions with panel-specific heuristic logic.
    Extended with real transaction analysis where available.
    """
    month = req.month or "(current month)"

    # Use real transaction analysis for merchant spending
    if panel_id in {"charts.month_merchants", "top_merchants"}:
        if req.month:
            try:
                result = explain_month_merchants(db, user_id, req.month)
                # Combine what + why for explain mode
                parts = []
                if result.get("what"):
                    parts.append(result["what"])
                if result.get("why"):
                    parts.append(result["why"])
                return (
                    " ".join(parts)
                    if parts
                    else f"Top merchants ranked by spend for {month}."
                )
            except Exception as e:
                logger.warning(f"explain_month_merchants failed: {e}")
                return f"Top merchants ranked by spend for {month}."

    # Original fallbacks for other panels
    if panel_id in {"overview.metrics.totalSpend", "total_spend"}:
        return f"Total spend shows all outgoing amounts for {month}."
    if panel_id.startswith("anomalies"):
        return (
            f"Highlights categories with unusual spend in {month} vs recent baseline."
        )
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


def _record_metrics(
    panel_id: str,
    mode: ModeType,
    llm_called: bool,
    rephrased: bool,
    provider: Optional[str],
) -> None:
    provider_name = (provider or "none").strip() or "none"
    if help_describe_requests:
        help_describe_requests.labels(
            panel=panel_id,
            mode=mode,
            llm_called="1" if llm_called else "0",
        ).inc()
    if rephrased and help_describe_rephrased:
        help_describe_rephrased.labels(panel=panel_id, provider=provider_name).inc()


@router.post("/agent/describe/{panel_id}")
def describe_panel(
    user_id: int = Depends(get_current_user_id),
    panel_id: str = ...,
    req: DescribeRequest = Body(default=DescribeRequest()),
    rephrase_q: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    body_fields = getattr(
        req, "model_fields_set", getattr(req, "__fields_set__", set())
    )
    body_has_rephrase = "rephrase" in body_fields

    rephrase_flag = settings.HELP_REPHRASE_DEFAULT
    if body_has_rephrase:
        rephrase_flag = (
            bool(req.rephrase)
            if req.rephrase is not None
            else settings.HELP_REPHRASE_DEFAULT
        )
    elif rephrase_q is not None:
        rephrase_flag = bool(rephrase_q)

    mode: ModeType = req.mode or ("explain" if rephrase_flag else "learn")
    rephrase_requested = mode == "explain"

    fhash = hash_filters(req.filters)
    key = help_cache.make_key(
        panel_id, req.month, fhash, rephrase_requested, user_id=user_id, mode=mode
    )
    cached = help_cache.get(key)
    if cached:
        cached.setdefault("panel_id", panel_id)
        cached.setdefault("provider", "none")
        cached.setdefault("mode", mode)
        cached.setdefault("llm_called", bool(cached.get("rephrased", False)))
        cached["rephrased"] = bool(cached.get("rephrased", False))
        cached.setdefault("reasons", [])
        _record_metrics(
            panel_id,
            cached.get("mode", mode),
            bool(cached.get("llm_called", False)),
            cached["rephrased"],
            cached.get("provider"),
        )
        return cached

    if mode == "learn":
        text = get_static_help_for_panel(panel_id)
        payload = {
            "panel_id": panel_id,
            "text": text,
            "grounded": True,
            "mode": "learn",
            "rephrased": False,
            "llm_called": False,
            "provider": "none",
            "reasons": [],
        }
        help_cache.set_(key, payload)
        _record_metrics(panel_id, "learn", False, False, "none")
        logger.info(
            "help.describe",
            extra={
                "panel": panel_id,
                "mode": "learn",
                "llm_called": False,
                "rephrased": False,
                "provider": "none",
            },
        )
        return payload

    # explain mode: deterministic base plus optional LLM polish
    base = _deterministic(panel_id, req, user_id, db)
    text = base
    provider = "none"
    was_rephrased = False
    llm_called = False
    reasons: List[str] = []
    fallback_reason = (
        "none"  # model_unavailable | identical_output | rate_limited | none
    )
    effective_unavailable = False

    # no-data fast path when a preview slice explicitly indicates empty data
    data_obj = req.data
    data_empty = False
    if isinstance(data_obj, dict):
        data_empty = len(data_obj) == 0
    elif isinstance(data_obj, (list, tuple, set)):
        data_empty = len(data_obj) == 0

    if data_empty:
        payload = {
            "panel_id": panel_id,
            "text": "No matching data for the selected context.",
            "grounded": True,
            "mode": "explain",
            "rephrased": False,
            "llm_called": False,
            "provider": "none",
            "reasons": ["no_data"],
        }
        help_cache.set_(key, payload)
        _record_metrics(panel_id, "explain", False, False, "none")
        logger.info(
            "help.describe",
            extra={
                "panel": panel_id,
                "mode": "explain",
                "llm_called": False,
                "rephrased": False,
                "provider": "none",
            },
        )
        return payload

    pol = _policy()
    allow_effective = bool(pol.get("allow"))
    ov = os.getenv("FORCE_HELP_LLM")
    if ov is not None:
        v = ov.strip().lower()
        if v in {"1", "true", "yes", "on"}:
            allow_effective = True
        elif v in {"0", "false", "no", "off"}:
            allow_effective = False
    if not allow_effective:
        reasons.append("llm_disabled")
    if pol.get("globally_disabled"):
        try:
            help_cache.clear()
        except Exception:
            pass

    if rephrase_requested and allow_effective:
        getattr(llm_mod, "reset_fallback_provider", lambda: None)()
        new_text = None
        try:
            llm_called = True
            new_text = agent_detect.try_llm_rephrase_summary(  # type: ignore[arg-type]
                panel_id,
                {"intent": panel_id, "filters": req.filters, "result": req.data},
                base,
            )
        except Exception:
            # treat as model unavailable
            fallback_reason = "model_unavailable"
            effective_unavailable = True
        fb = getattr(llm_mod, "get_last_fallback_provider", lambda: None)()
        if new_text and hasattr(new_text, "strip"):
            cleaned = new_text.strip()
            SENTINEL = "The language model is temporarily unavailable."
            if cleaned:
                if cleaned.startswith("[polished]") or (
                    cleaned != base and cleaned != SENTINEL
                ):
                    text = cleaned
                    was_rephrased = True
                else:
                    text = cleaned or base
                    # classify fallback reason when not rephrased
                    if cleaned == base:
                        fallback_reason = "identical_output"
                        reasons.append("identical_output")
                    elif cleaned == SENTINEL:
                        fallback_reason = "model_unavailable"
                    else:
                        # keep none
                        pass
            else:
                reasons.append("empty_output")
                fallback_reason = "model_unavailable"
        else:
            # no response text
            reasons.append("llm_no_response")
            fallback_reason = "model_unavailable"
        if fb:
            provider = f"fallback-{fb}"
        elif llm_called:
            provider = "primary"

        # Effective outage only when model_unavailable and not rephrased
        if fallback_reason == "model_unavailable" and not was_rephrased:
            effective_unavailable = True

        if provider.startswith("fallback-"):

            def _emit() -> None:
                try:
                    emit_fallback(
                        {
                            "rid": key[:12],
                            "provider": provider,
                            "requested_model": getattr(
                                settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b"
                            ),
                            "fallback_model": getattr(
                                settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b"
                            ),
                        }
                    )
                except Exception:
                    pass

            threading.Thread(target=_emit, daemon=True).start()

    payload = {
        "panel_id": panel_id,
        "text": text,
        "grounded": True,
        "mode": "explain",
        "rephrased": bool(was_rephrased),
        "llm_called": bool(llm_called),
        "provider": provider or ("primary" if llm_called else "none"),
        "reasons": reasons if was_rephrased is False else [],
        "fallback_reason": fallback_reason,
        "effective_unavailable": effective_unavailable,
    }
    help_cache.set_(key, payload)
    _record_metrics(
        panel_id,
        "explain",
        payload["llm_called"],
        payload["rephrased"],
        payload["provider"],
    )
    if (not payload["rephrased"]) and payload.get("fallback_reason") not in (
        None,
        "none",
    ):
        if help_describe_fallbacks:
            try:
                help_describe_fallbacks.labels(
                    panel=panel_id, reason=payload["fallback_reason"]
                ).inc()
            except Exception:
                pass
    logger.info(
        "help.describe",
        extra={
            "panel": panel_id,
            "mode": "explain",
            "llm_called": payload["llm_called"],
            "rephrased": payload["rephrased"],
            "provider": payload["provider"],
            "fallback_reason": payload["fallback_reason"],
            "effective_unavailable": payload["effective_unavailable"],
        },
    )
    return payload


@router.get("/help/describe")
def describe_help_get_hint():
    raise HTTPException(status_code=405, detail="Use POST /agent/describe/{panel_id}")


# Backwards/forwards compatibility aliases
router.add_api_route("/api/agent/describe/{panel_id}", describe_panel, methods=["POST"])


@router.get("/api/help/describe")
def describe_help_get_hint_api():
    raise HTTPException(status_code=405, detail="Use POST /agent/describe/{panel_id}")
