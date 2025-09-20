from __future__ import annotations
from typing import Any, Dict, List, Optional

def reply(text: str, *, meta: Optional[Dict[str, Any]] = None, rephrased: bool = False) -> Dict[str, Any]:
    """Small helper to shape deterministic agent-tool replies."""
    return {"reply": text, "meta": meta or {}, "rephrased": rephrased}

def no_data_msg(period_label: str, *, tool: str, tips: Optional[List[str]] = None) -> Dict[str, Any]:
    """Standardised message when a tool cannot run due to missing data."""
    tips = tips or [
        "Switch to Insights: Expanded (last 60 days)",
        "Pick a month with transactions",
        "Upload a CSV (top-right) and try again",
    ]
    suggestions = [{"label": tip} for tip in tips]
    text = (
        f"I didn't find enough data to run **{tool}** for {period_label}."\
        + "\nTry one of these:\n- " + "\n- ".join(tips)
    )
    return reply(text, meta={"reason": "no_data", "tool": tool, "suggestions": suggestions}, rephrased=False)
