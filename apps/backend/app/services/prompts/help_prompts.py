"""
Centralized prompt templates for help system.

Makes it easy to tune prompts without touching business logic.
"""

BASE_SYSTEM = (
    "You are LedgerMind's finance explainer. Be concise (2–4 sentences), specific, and grounded. "
    "Prefer concrete drivers (subscriptions, utilities, single-day spikes, merchant concentration). "
    "Avoid speculation and do not invent facts not implied by data/snippets. "
    "Max 60 words."
)

TEMPLATE_GENERIC = """\
Context:
{context_bullets}

Snippets:
{snippets}

Task:
Explain the likely WHY behind this card for {month}. Mention concrete drivers if supported. Keep it to 2–4 sentences.
"""

TEMPLATE_MERCHANTS = """\
Context (Top Merchants):
{context_bullets}

Snippets:
{snippets}

Task:
Explain why spend is elevated or concentrated among these merchants in {month}. Prefer concrete drivers in this priority: subscriptions/utilities → single-day spikes → merchant concentration → category shifts. Avoid speculation. 2–4 sentences.
"""

TEMPLATE_CATEGORIES = """\
Context (Top Categories):
{context_bullets}

Snippets:
{snippets}

Task:
Explain which categories drive outflows in {month} and why. Prefer concrete drivers: subscriptions/utilities → single-day spikes → category concentration. Only infer what the snippets imply. 2–4 sentences.
"""

TEMPLATE_FLOWS = """\
Context (Daily Flows):
{context_bullets}

Snippets:
{snippets}

Task:
Explain spike days or flow patterns in {month}. Focus on concrete causes if supported. 2–4 sentences.
"""

TEMPLATE_ANOMALIES = """\
Context (Anomalies):
{context_bullets}

Snippets:
{snippets}

Task:
Explain which anomalies (spikes, outliers, unusual patterns) occurred in {month} and their likely causes. Be specific about dates and amounts. 2–4 sentences.
"""

TEMPLATE_INSIGHTS = """\
Context (Overview):
{context_bullets}

Snippets:
{snippets}

Task:
Give a concise month overview for {month} with likely drivers. Highlight the most important patterns: dominant categories/merchants, unusual spikes, or recurring bills. 2–4 sentences.
"""

# Map panel IDs to their specific templates
PROMPT_BY_PANEL = {
    "charts.month_merchants": TEMPLATE_MERCHANTS,
    "charts.month_categories": TEMPLATE_CATEGORIES,
    "charts.daily_flows": TEMPLATE_FLOWS,
    "charts.month_anomalies": TEMPLATE_ANOMALIES,
    "charts.insights_overview": TEMPLATE_INSIGHTS,
}
