from __future__ import annotations
from typing import Dict, Any

ANALYTICS_HINTS = (
    "kpi", "kpis", "forecast", "anomal", "anomaly", "anomalies",
    "recurring", "budget", "budgets"
)

def tag_if_analytics(user_text: str, resp: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure analytics-like prompts always expose a mode.
    Adds breadcrumb fields so we can confirm execution under hermetic runs.
    """
    if not isinstance(resp, dict):
        return resp
    txt = (user_text or "").lower()
    looks_analytics = any(h in txt for h in ANALYTICS_HINTS)
    has_mode = bool(resp.get("mode"))

    if looks_analytics and not has_mode:
        meta = resp.setdefault("meta", {})
        meta.setdefault("reason", "post_tag_injection")
        meta["router_tag_injected"] = True
        if not resp.get("reply"):
            resp["reply"] = (
                "I couldn’t run the analytics tool with the current context. "
                "Try a month with transactions or toggle Insights: Expanded."
            )
            resp["rephrased"] = False
        resp["mode"] = "analytics.fallback"

    # Breadcrumb always added so we can detect tagger activation
    resp["_router_fallback_active"] = True
    return resp
