"""Static help copy for learn-mode describe responses."""

from __future__ import annotations

from typing import Dict

PANEL_HELP: Dict[str, str] = {
    "top_merchants": "Highlights the merchants where you spent the most in the selected period.",
    "top_categories": "Shows which spending categories account for most of your outgoing transactions.",
    "overview": "Summarises spend, income, and net flow for the selected month.",
    "forecast": "Projects balances forward based on recent history and seasonality where available.",
    "rule_suggestions": "Suggests new categorisation rules learned from your recent behaviour.",
}


def get_static_help_for_panel(panel_id: str) -> str:
    """Return deterministic copy for learn-mode help.

    The fallback keeps copy stable even when we have not curated text for a
    specific panel yet.
    """

    return PANEL_HELP.get(
        panel_id,
        "This panel provides additional insight based on the data currently in view.",
    )


__all__ = ["get_static_help_for_panel"]
