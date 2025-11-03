from __future__ import annotations
from typing import Dict, Any

ANALYTICS_HINTS = (
    "kpi",
    "kpis",
    "forecast",
    "anomal",
    "anomaly",
    "anomalies",
    "recurring",
    "budget",
    "budgets",
)


def tag_if_analytics(user_text: str, resp: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure analytics-like prompts always expose a mode.
    Adds breadcrumb fields so we can confirm execution under hermetic runs.

    Only sets _router_fallback_active=True when actually injecting fallback mode.
    Preserves existing _router_fallback_active value in all other cases.
    """
    if not isinstance(resp, dict):
        return resp
    txt = (user_text or "").lower()
    looks_analytics = any(h in txt for h in ANALYTICS_HINTS)
    has_mode = bool(resp.get("mode"))

    if looks_analytics and not has_mode:
        # No mode present - inject analytics fallback
        meta = resp.setdefault("meta", {})
        meta.setdefault("reason", "post_tag_injection")
        meta["router_tag_injected"] = True
        if not resp.get("reply"):
            resp["reply"] = (
                "I couldn't run the analytics tool with the current context. "
                "Try a month with transactions or toggle Insights: Expanded."
            )
            resp["rephrased"] = False
        resp["mode"] = "analytics.fallback"
        # Only NOW set fallback flag since we're actually falling back
        resp["_router_fallback_active"] = True
    # else: mode exists (primary LLM or router tool) - preserve existing _router_fallback_active

    return resp
