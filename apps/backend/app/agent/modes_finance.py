"""Finance agent modes - deterministic finance tool wrappers."""

from typing import Dict, Any
from httpx import AsyncClient

from app.agent.finance_utils import detect_empty_month
from app.config import settings

# Import LLM-powered handlers
try:
    from app.agent.modes_finance_llm import (
        mode_finance_quick_recap_llm,
        mode_finance_deep_dive_llm,
    )

    _HAS_LLM_MODES = True
except ImportError:
    _HAS_LLM_MODES = False


async def mode_finance_quick_recap(
    month: str,
    http: AsyncClient,
    user_context: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Summarize this month using charts + insights tools.
    Returns an AgentChatResponse-compatible dict.
    """

    # 1) Call deterministic tools
    summary = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/charts/summary",
            json={"month": month, "include_daily": False},
        )
    ).json()

    expanded = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/insights/expanded",
            json={"month": month, "large_limit": 5},
        )
    ).json()

    merchants = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/charts/merchants",
            json={"month": month, "limit": 1},
        )
    ).json()

    is_empty, unknown_count = detect_empty_month(summary, expanded)

    # 2) Empty-state answer (what you're seeing right now)
    if is_empty:
        reply = (
            f"{month} — Quick recap\n\n"
            "I don't see any transactions for this month yet.\n\n"
            "To get insights, upload a CSV / Excel file in the **Upload "
            "Transactions** section above. Once you have some data, I can:\n"
            "- Summarize income, spend, and net\n"
            "- Flag unusual spikes\n"
            "- Suggest a starting budget\n"
        )

        suggestions = [
            {
                "label": "Upload transactions",
                "action": "open_upload",
                "source": "gateway",
            },
            {"label": "Change month", "action": "change_month", "source": "gateway"},
        ]

        return {
            "reply": reply,
            "citations": [{"type": "charts.summary", "count": 1}],
            "used_context": {"month": month},
            "tool_trace": ["charts.summary"],
            "model": "deterministic",
            "mode": "finance_quick_recap",
            "args": {"month": month},
            "suggestions": suggestions,
            "_router_fallback_active": True,
        }

    # 3) Real recap when there *is* data
    s = summary["summary"]
    income = float(s["income"])
    spend = float(s["spend"])
    net = float(s["net"])

    top_merchant = None
    if merchants.get("merchants"):
        m0 = merchants["merchants"][0]
        top_merchant = f"{m0['merchant']} — ${abs(m0['amount']):.2f}"

    unknown = expanded.get("unknown_spend") or {}
    unknown_amt = float(unknown.get("amount") or 0.0)
    unknown_ct = int(unknown.get("count") or 0)

    reply_lines: list[str] = []
    reply_lines.append(f"{month} — Quick recap\n")
    reply_lines.append(f"- **Income:** ${income:,.2f}")
    reply_lines.append(f"- **Spend:** ${abs(spend):,.2f}")
    reply_lines.append(f"- **Net:** ${net:,.2f}")

    if top_merchant:
        reply_lines.append(f"- **Top merchant:** {top_merchant}")
    if unknown_ct:
        reply_lines.append(
            f"- **Unknown:** ${abs(unknown_amt):,.2f} across {unknown_ct} txn(s)"
        )

    reply_lines.append(
        "\nTip: Ask for a *deep dive* if you want anomalies, categories and top merchants."
    )

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

    # Suggested actions for manual categorization
    suggested_actions = []
    if unknown_ct > 0:
        suggested_actions.append(
            {
                "kind": "manual_categorize_unknowns",
                "label": "Categorize uncategorized transactions",
                "scope": "same_merchant",
            }
        )
    # Always offer undo (frontend can hide if no snapshot exists)
    suggested_actions.append(
        {
            "kind": "undo_last_bulk_categorize",
            "label": "Undo last bulk categorization",
        }
    )

    return {
        "reply": "\n".join(reply_lines),
        "citations": [
            {"type": "charts.summary", "count": 1},
            {"type": "insights.expanded", "count": 1},
        ],
        "used_context": {"month": month},
        "tool_trace": ["charts.summary", "insights.expanded", "charts.merchants"],
        "model": "deterministic",
        "mode": "finance_quick_recap",
        "args": {"month": month},
        "suggestions": suggestions,
        "suggested_actions": suggested_actions,
        "_router_fallback_active": True,  # still deterministic, no LLM
    }


async def mode_finance_deep_dive(
    month: str,
    http: AsyncClient,
    user_context: Dict[str, Any],
) -> Dict[str, Any]:
    """Deep dive with categories and anomalies."""
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

    is_empty, _ = detect_empty_month(summary, expanded)
    if is_empty:
        reply = (
            f"{month} — Deep dive\n\n"
            "There still aren't any transactions to analyze this month, "
            "so there's no deeper breakdown yet.\n\n"
            "Once you upload some data, I'll:\n"
            "- Group spend by category\n"
            "- Highlight spikes vs last month\n"
            "- Surface top merchants and unknowns"
        )
        return {
            "reply": reply,
            "citations": [{"type": "charts.summary", "count": 1}],
            "used_context": {"month": month},
            "tool_trace": ["charts.summary"],
            "mode": "finance_deep_dive",
            "_router_fallback_active": True,
        }

    cats = (expanded.get("categories") or [])[:5]
    anomalies = expanded.get("anomalies") or []

    reply_lines: list[str] = []
    reply_lines.append(f"{month} — Deep dive\n")
    reply_lines.append("**By category (top 5)** —")

    if not cats:
        reply_lines.append("No category breakdown available.")
    else:
        for c in cats:
            reply_lines.append(
                f"- {c['label']}: ${abs(c['amount']):,.2f} "
                f"({c.get('share_pct', 0):.1f}% of spend)"
            )

    # Spikes section
    spike_lines: list[str] = []
    for a in anomalies[:5]:
        spike_lines.append(
            f"- {a['merchant']} on {a['date']}: ${abs(a['amount']):,.2f} ({a['reason']})"
        )

    if spike_lines:
        reply_lines.append("\n**Spikes & anomalies** —")
        reply_lines.extend(spike_lines)
    else:
        reply_lines.append("\nNo unusual spikes this month.")

    reply_lines.append(
        "\nNext actions: ask me to *show only spikes*, *top merchants detail*, or *budget check*."
    )

    # Suggested actions for manual categorization
    unknown = expanded.get("unknown_spend") or {}
    unknown_ct = int(unknown.get("count") or 0)

    suggested_actions = []
    if unknown_ct > 0:
        suggested_actions.append(
            {
                "kind": "manual_categorize_unknowns",
                "label": "Categorize uncategorized transactions",
                "scope": "same_merchant",
            }
        )
    # Always offer undo (frontend can hide if no snapshot exists)
    suggested_actions.append(
        {
            "kind": "undo_last_bulk_categorize",
            "label": "Undo last bulk categorization",
        }
    )

    return {
        "reply": "\n".join(reply_lines),
        "citations": [
            {"type": "insights.expanded", "count": 1},
        ],
        "used_context": {"month": month},
        "tool_trace": ["insights.expanded"],
        "mode": "finance_deep_dive",
        "suggested_actions": suggested_actions,
        "_router_fallback_active": True,
    }


async def mode_analytics_spikes_only(
    month: str,
    http: AsyncClient,
    user_context: Dict[str, Any],
) -> Dict[str, Any]:
    """Show only spikes/anomalies from insights."""
    expanded = (
        await http.post(
            f"{settings.INTERNAL_API_ROOT}/agent/tools/insights/expanded",
            json={"month": month, "large_limit": 20},
        )
    ).json()

    anomalies = expanded.get("anomalies") or []

    if not anomalies:
        reply = (
            f"{month} — Spikes\n\n"
            "I didn't detect any unusual spikes this month. "
            "Spending looks relatively stable compared to your baseline."
        )
        return {
            "reply": reply,
            "citations": [{"type": "insights.expanded", "count": 1}],
            "used_context": {"month": month},
            "tool_trace": ["insights.expanded"],
            "mode": "analytics.spikes_only",
            "_router_fallback_active": True,
        }

    reply_lines = [f"{month} — Spikes only\n"]
    reply_lines.append("Here are the biggest spikes by amount:")

    for a in anomalies[:5]:
        reply_lines.append(
            f"- {a['merchant']} on {a['date']}: "
            f"${abs(a['amount']):,.2f} ({a['reason']})"
        )

    reply_lines.append(
        "\nAsk for a *budget check* if you want a suggested cap for these categories."
    )

    return {
        "reply": "\n".join(reply_lines),
        "citations": [{"type": "insights.expanded", "count": 1}],
        "used_context": {"month": month},
        "tool_trace": ["insights.expanded"],
        "mode": "analytics.spikes_only",
        "_router_fallback_active": True,
    }


# Mode dispatcher
# Wrapper functions that try LLM first, fall back to deterministic
async def finance_quick_recap_with_fallback(
    month: str,
    http: AsyncClient,
    user_context: Dict[str, Any],
) -> Dict[str, Any]:
    """Try LLM-powered quick recap, fall back to deterministic on error."""
    if _HAS_LLM_MODES:
        try:
            # Check if LLM is available
            from app.services.llm_health import is_llm_available

            if await is_llm_available():
                return await mode_finance_quick_recap_llm(month, http, user_context)
        except Exception:
            pass  # Fall through to deterministic

    # Deterministic fallback
    return await mode_finance_quick_recap(month, http, user_context)


async def finance_deep_dive_with_fallback(
    month: str,
    http: AsyncClient,
    user_context: Dict[str, Any],
) -> Dict[str, Any]:
    """Try LLM-powered deep dive, fall back to deterministic on error."""
    if _HAS_LLM_MODES:
        try:
            from app.services.llm_health import is_llm_available

            if await is_llm_available():
                return await mode_finance_deep_dive_llm(month, http, user_context)
        except Exception:
            pass  # Fall through to deterministic

    # Deterministic fallback
    return await mode_finance_deep_dive(month, http, user_context)


MODE_HANDLERS = {
    "finance_quick_recap": finance_quick_recap_with_fallback,
    "finance_deep_dive": finance_deep_dive_with_fallback,
    "analytics.spikes_only": mode_analytics_spikes_only,
}
