from __future__ import annotations
from typing import Any, Dict, List, Optional
from app.utils.time import utc_now

# Backwards-compatible, expanded helpers for consistent structured replies & empty states.

def make_chip(label: str, action: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """UI chip with optional structured action."""
    chip = {"label": label}
    if action:
        chip["action"] = action
    return chip

def reply(
    text: str,
    *,
    mode: Optional[str] = None,
    rephrased: bool = False,
    result: Optional[Dict[str, Any]] = None,
    filters: Optional[Dict[str, Any]] = None,
    suggestions: Optional[List[Dict[str, Any]]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "ok": True,
        "reply": text,
        "message": text,
        "summary": text,
        "rephrased": rephrased,
        "result": result or {},
        "filters": filters or {},
    }
    if mode:
        payload["mode"] = mode
    m = meta.copy() if meta else {}
    if suggestions:
        m["suggestions"] = suggestions
    if m:
        payload["meta"] = m
    return payload

def no_data_msg(period_label: str, *, tool: str, tips: Optional[List[str]] = None) -> Dict[str, Any]:
    """Legacy-style no-data message retained for existing callers."""
    tips = tips or [
        "Switch to Insights: Expanded (last 60 days)",
        "Pick a month with transactions",
        "Upload a CSV (top-right) and try again",
    ]
    suggestions = [make_chip(t) for t in tips]
    text = (
        f"I didn't find enough data to run **{tool}** for {period_label}."\
        + "\nTry one of these:\n- " + "\n- ".join(tips)
    )
    return reply(
        text,
        mode=tool,
        suggestions=suggestions,
        meta={"reason": "no_data", "tool": tool},
    )

def no_data_kpis(month_str: str) -> Dict[str, Any]:
    text = (
        f"I couldn't compute **KPIs** for **{month_str}** (not enough data).\n"
        "Try one of these:\n"
        "- **Insights: Expanded** (last 60 days)\n"
        "- Pick a month with ≥3 months of history\n"
        "- Connect another account"
    )
    suggestions = [
        make_chip("Insights: Expanded (60d)", {"type": "tool", "mode": "insights.expanded", "args": {"lookback_days": 60}}),
        make_chip("Last 3 months", {"type": "tool", "mode": "analytics.kpis", "args": {"lookback_months": 3}}),
        make_chip("Change month", {"type": "ui", "action": "open-month-picker"}),
    ]
    return reply(
        text,
        mode="analytics.kpis",
        suggestions=suggestions,
        meta={"reason": "not_enough_history"},
    )


def no_data_kpis_optional(month: Optional[str] = None) -> Dict[str, Any]:
    """Alternate helper matching requested optional signature; defers to primary style."""
    m = month or f"{utc_now().year:04d}-{utc_now().month:02d}"
    suggestions = [
        make_chip("Insights: Expanded (last 60 days)"),
        make_chip("Lower minimum amount (e.g., $25)"),
        make_chip("Increase lookback (e.g., 6 months)"),
    ]
    text = (
        f"I didn't find enough data to compute **KPIs** for **{m}**.\n"
        f"Try one of these:"
    )
    return reply(
        text,
        mode="analytics.kpis",
        suggestions=suggestions,
        meta={"reason": "not_enough_data"},
    )

def no_data_anomalies(month_str: str) -> Dict[str, Any]:
    text = (
        f"No anomalies detected for **{month_str}**.\n"
        "Tips:\n"
        "- Lower the sensitivity (e.g., threshold **0.3**)\n"
        "- Widen the window (e.g., **last 60 days**)\n"
        "- Lower the minimum amount (e.g., **$25**)"
    )
    suggestions = [
        make_chip("Lower threshold (0.3)", {"type": "tool", "mode": "insights.anomalies", "args": {"threshold": 0.3}}),
        make_chip("Last 60 days", {"type": "tool", "mode": "insights.anomalies", "args": {"months": 2}}),
        make_chip("Min ≥ $25", {"type": "tool", "mode": "insights.anomalies", "args": {"min": 25}}),
    ]
    return reply(
        text,
        mode="insights.anomalies",
        suggestions=suggestions,
        meta={"reason": "no_anomalies"},
    )

__all__ = [
    "make_chip",
    "reply",
    "no_data_msg",
    "no_data_kpis",
    "no_data_anomalies",
]
