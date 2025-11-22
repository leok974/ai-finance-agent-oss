"""LLM-powered finance agent modes - use prompts with tool data for rich narratives."""

from typing import Dict, Any, List
from httpx import AsyncClient
import json

from app.agent.prompts import (
    FINANCE_QUICK_RECAP_PROMPT,
    FINANCE_DEEP_DIVE_PROMPT,
)
from app.config import settings


async def mode_finance_quick_recap_llm(
    month: str,
    http: AsyncClient,
    user_context: Dict[str, Any],
) -> Dict[str, Any]:
    """
    LLM-powered quick recap using charts.summary + FINANCE_QUICK_RECAP_PROMPT.
    Returns an AgentChatResponse-compatible dict with _router_fallback_active: False.
    """
    # Import LLM utilities
    from app.utils import llm as llm_mod

    # 1) Gather tool data
    summary = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/charts/summary",
            json={"month": month, "include_daily": False},
        )
    ).json()

    # Extract the summary data
    s = summary.get("summary", {})
    income = float(s.get("income", 0))
    spend = float(s.get("spend", 0))
    net = float(s.get("net", 0))

    # Get top merchants
    merchants_resp = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/charts/merchants",
            json={"month": month, "limit": 5},
        )
    ).json()
    top_merchants = merchants_resp.get("merchants", [])[:5]

    # Get insights for unknowns and categories
    expanded = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/insights/expanded",
            json={"month": month, "large_limit": 5},
        )
    ).json()

    unknown_spend = expanded.get("unknown_spend") or {}
    unknown_amt = float(unknown_spend.get("amount") or 0.0)
    unknown_ct = int(unknown_spend.get("count") or 0)

    top_categories = (expanded.get("categories") or [])[:5]

    # 2) Build structured data for LLM
    llm_data = {
        "month": month,
        "income": income,
        "spend": abs(spend),
        "net": net,
        "top_categories": [
            {
                "category_slug": c.get("label", "Unknown"),
                "amount": abs(c.get("amount", 0)),
            }
            for c in top_categories
        ],
        "top_merchants": [
            {
                "merchant": m.get("merchant", "Unknown"),
                "amount": abs(m.get("amount", 0)),
                "count": m.get("count", 0),
            }
            for m in top_merchants
        ],
        "unknown_spend": (
            {"amount": abs(unknown_amt), "count": unknown_ct}
            if unknown_ct > 0
            else None
        ),
    }

    # 3) Call LLM with prompt + data
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": FINANCE_QUICK_RECAP_PROMPT},
        {
            "role": "user",
            "content": f"Here's the financial data for {month}:\n\n{json.dumps(llm_data, indent=2)}",
        },
    ]

    model = getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b")
    reply, tool_trace = llm_mod.call_local_llm(
        model=model,
        messages=messages,
        temperature=0.3,
        top_p=0.9,
    )

    # 4) Build suggestions (action chips)
    suggestions = [
        {
            "label": "Show deeper breakdown",
            "action": "finance_deep_dive",
            "source": "gateway",
        },
        {
            "label": "Show spikes",
            "action": "analytics.spikes_only",
            "source": "gateway",
        },
        {
            "label": "Top merchants detail",
            "action": "charts.merchants_detail",
            "source": "gateway",
        },
        {
            "label": "Budget check",
            "action": "analytics.budget_check",
            "source": "gateway",
        },
    ]

    # 5) Return response (NOT deterministic - LLM-powered)
    return {
        "reply": reply,
        "citations": [
            {"type": "charts.summary", "count": 1},
            {"type": "charts.merchants", "count": 1},
            {"type": "insights.expanded", "count": 1},
        ],
        "used_context": {"month": month},
        "tool_trace": ["charts.summary", "charts.merchants", "insights.expanded"]
        + tool_trace,
        "model": model,
        "mode": "finance_quick_recap",
        "args": {"month": month},
        "suggestions": suggestions,
        "_router_fallback_active": False,  # LLM-powered, not deterministic
    }


async def mode_finance_deep_dive_llm(
    month: str,
    http: AsyncClient,
    user_context: Dict[str, Any],
) -> Dict[str, Any]:
    """
    LLM-powered deep dive using insights.expanded + FINANCE_DEEP_DIVE_PROMPT.
    Returns an AgentChatResponse-compatible dict with _router_fallback_active: False.
    """
    from app.utils import llm as llm_mod

    # 1) Gather rich tool data (insights.expanded for deep dive)
    summary = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/charts/summary",
            json={"month": month, "include_daily": False},
        )
    ).json()

    expanded = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/insights/expanded",
            json={"month": month, "large_limit": 10},
        )
    ).json()

    merchants_resp = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/charts/merchants",
            json={"month": month, "limit": 10},
        )
    ).json()

    # Extract data
    s = summary.get("summary", {})
    income = float(s.get("income", 0))
    spend = float(s.get("spend", 0))
    net = float(s.get("net", 0))

    categories = (expanded.get("categories") or [])[:10]
    anomalies = expanded.get("anomalies") or []
    unknown_spend = expanded.get("unknown_spend") or {}
    unknown_amt = float(unknown_spend.get("amount") or 0.0)
    unknown_ct = int(unknown_spend.get("count") or 0)

    merchants = merchants_resp.get("merchants", [])[:10]

    # 2) Build structured data for LLM
    llm_data = {
        "month": month,
        "income": income,
        "spend": abs(spend),
        "net": net,
        "categories": [
            {
                "category_slug": c.get("label", "Unknown"),
                "amount": abs(c.get("amount", 0)),
                "pct_of_spend": c.get("share_pct", 0),
            }
            for c in categories
        ],
        "merchants": [
            {
                "merchant": m.get("merchant", "Unknown"),
                "amount": abs(m.get("amount", 0)),
                "count": m.get("count", 0),
                "category_slug": m.get("category", "Unknown"),
            }
            for m in merchants
        ],
        "anomalies": [
            {
                "merchant": a.get("merchant", "Unknown"),
                "amount": abs(a.get("amount", 0)),
                "date": a.get("date", ""),
                "reason": a.get("reason", "spike"),
            }
            for a in anomalies[:10]
        ],
        "unknown_spend": (
            {"amount": abs(unknown_amt), "count": unknown_ct}
            if unknown_ct > 0
            else None
        ),
    }

    # 3) Call LLM with prompt + data
    messages: List[Dict[str, str]] = [
        {"role": "system", "content": FINANCE_DEEP_DIVE_PROMPT},
        {
            "role": "user",
            "content": f"Here's the detailed financial data for {month}:\n\n{json.dumps(llm_data, indent=2)}",
        },
    ]

    model = getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b")
    reply, tool_trace = llm_mod.call_local_llm(
        model=model,
        messages=messages,
        temperature=0.3,
        top_p=0.9,
    )

    # 4) Build suggestions
    suggestions = [
        {
            "label": "Show spikes only",
            "action": "analytics.spikes_only",
            "source": "gateway",
        },
        {
            "label": "Categorize unknowns",
            "action": "categorize_unknowns",
            "source": "gateway",
        },
        {
            "label": "Top merchants detail",
            "action": "charts.merchants_detail",
            "source": "gateway",
        },
        {
            "label": "Budget check",
            "action": "analytics.budget_check",
            "source": "gateway",
        },
    ]

    # 5) Return LLM-powered response
    return {
        "reply": reply,
        "citations": [
            {"type": "charts.summary", "count": 1},
            {"type": "insights.expanded", "count": 1},
            {"type": "charts.merchants", "count": 1},
        ],
        "used_context": {"month": month},
        "tool_trace": ["charts.summary", "insights.expanded", "charts.merchants"]
        + tool_trace,
        "model": model,
        "mode": "finance_deep_dive",
        "args": {"month": month},
        "suggestions": suggestions,
        "_router_fallback_active": False,  # LLM-powered
    }
