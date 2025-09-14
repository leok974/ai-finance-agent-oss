from __future__ import annotations

# Static, human-friendly help for charts and cards. Minimal and framework-agnostic.
UI_HELP = {
    # Charts
    "charts.month_merchants": {
        "title": "Top Merchants (This Month)",
        "what": "Breakdown of your spending by merchant for the selected month.",
        "how_to_read": [
            "Each slice represents one merchant; bigger slice = more spend.",
            "Hover to see exact amount and share.",
            "Use the legend to focus on a merchant.",
        ],
        "tips": [
            "Use it to spot recurring vendors or surprise big spenders.",
            "Click a merchant to filter related transactions (if supported).",
        ],
        "gotchas": [
            "Only includes **outflows** (spend). Refunds may reduce a slice.",
        ],
    },
    "charts.month_flows": {
        "title": "Cash In vs Out (This Month)",
        "what": "Bars comparing total inflows and outflows for the month.",
        "how_to_read": [
            "Left bar = money in (income/transfers in).",
            "Right bar = money out (spending/bills/transfers out).",
            "Net = inflows − outflows.",
        ],
        "tips": ["Use alongside KPIs to track savings rate."],
        "gotchas": ["Transfers can inflate inflows if your data includes them."],
    },
    "charts.spending_trends": {
        "title": "Spending Trends",
        "what": "Line/area trend of spend over recent months.",
        "how_to_read": [
            "Each point is total outflows that month.",
            "Look for rising or falling patterns.",
        ],
        "tips": ["Seasonality is common (e.g., holidays)."],
        "gotchas": ["Sparse months can make the line jumpy."],
    },

    # Cards / panels
    "cards.month_summary": {
        "title": "Month Summary",
        "what": "Totals (inflows, outflows, net) and key highlights for the selected month.",
        "how_to_read": ["Net > 0 means you saved; Net < 0 means you overspent."],
        "tips": ["Use ‘What-If’ to test quick savings ideas."],
        "gotchas": ["If you see 401 in dev, the UI uses the tool POST fallback."],
    },
    "cards.top_merchants": {
        "title": "Top Merchants",
        "what": "Table of the largest merchants by spend this month.",
        "how_to_read": ["Sorted by amount; use it to locate subscriptions or spikes."],
        "tips": ["Click a row to open merchant details (if wired)."],
        "gotchas": ["Category ‘Unknown’ means the transaction wasn’t labeled."],
    },
    "cards.top_categories": {
        "title": "Top Categories",
        "what": "Bar chart of the largest spending categories this month.",
        "how_to_read": [
            "Each bar is a category; longer bar = higher spend.",
            "Use colors as a quick heat scale: green → amber → red.",
        ],
        "tips": [
            "Focus on red bars to find savings opportunities.",
            "Click through to view related transactions (if supported).",
        ],
        "gotchas": [
            "If categories look off, try running the Rule Suggestions or fix Unknowns.",
        ],
    },
    "cards.cashflow": {
        "title": "Cashflow",
        "what": "Snapshot of money in vs out this month.",
        "how_to_read": ["Watch the gap between in and out; that’s your savings rate proxy."],
        "tips": ["Compare to last month for momentum."],
        "gotchas": ["One-offs can skew this—check anomalies if it looks off."],
    },
    "cards.trends": {
        "title": "Trends",
        "what": "Recent multi-month view of spend/income.",
        "how_to_read": ["Use to sanity-check forecasts."],
        "tips": ["Pairs well with ‘Forecast next 3 months’."],
        "gotchas": ["Short history reduces reliability."],
    },
    "cards.budget_check": {
        "title": "Budget Check",
        "what": "Shows category progress vs limit.",
        "how_to_read": ["Bar fills as you spend; red means over budget."],
        "tips": ["Draft limits from p50/p75/p90 in Budget Suggest."],
        "gotchas": ["No limit set → card may be empty."],
    },
    "cards.insights": {
        "title": "Insights",
        "what": "LLM-rephrased highlights from deterministic data.",
        "how_to_read": ["Bullets explain ‘why it matters’ with links to charts."],
        "tips": ["Click a bullet’s CTAs (e.g., run What-If)."],
        "gotchas": ["Grounded by JSON from tools; if empty, check selected month."],
    },
    "cards.unknowns": {
        "title": "Unknowns",
        "what": "Transactions without a category yet.",
        "how_to_read": [
            "Review merchant and description to decide the right category.",
            "Use ‘Seed rule’ to prefill the Rule Tester and save a reusable rule.",
        ],
        "tips": [
            "Apply a few categories to teach the model (if enabled).",
            "Use the Rule Tester to validate against recent history.",
        ],
        "gotchas": [
            "Some bank exports omit categories entirely; rules help auto-fill.",
        ],
    },
    "cards.rule_suggestions": {
        "title": "Rule Suggestions",
        "what": "Proposed merchant→category rules from your history.",
        "how_to_read": [
            "Rows show a candidate rule and how often it appeared.",
            "Accept to add the rule, Dismiss to hide, Ignore to mute a pair.",
        ],
        "tips": [
            "Start with frequent pairs to maximize automation.",
            "Use ‘Show ignores’ to manage muted pairs.",
        ],
        "gotchas": [
            "Mixed merchant spellings may need a broader description match.",
        ],
    },
    "cards.ml_status": {
        "title": "Model & Tools Status",
        "what": "Shows LLM/model availability and tool health.",
        "how_to_read": [
            "Green = ready; Yellow = degraded; Red = offline.",
        ],
        "tips": [
            "If rephrase stalls, check this panel first.",
        ],
        "gotchas": [
            "Local models may sleep; first call can be slower.",
        ],
    },
    "cards.budgets": {
        "title": "Budgets",
        "what": "Your category limits for the month and current progress.",
        "how_to_read": [
            "Bars fill as you spend; red means over limit.",
        ],
        "tips": [
            "Draft limits from p50/p75/p90 in Recommendations.",
        ],
        "gotchas": [
            "No limit set → card may be empty.",
        ],
    },
    "cards.budget_recommendations": {
        "title": "Budget Recommendations",
        "what": "Suggested limits from your historical spending.",
        "how_to_read": [
            "Pick p50/p75/p90; click Apply to create draft budgets.",
        ],
        "tips": [
            "Start p75 to allow some variance; tighten later.",
        ],
        "gotchas": [
            "Short history reduces reliability.",
        ],
    },
}

# Backfill additional keys used by the frontend so unknown keys don't degrade UX
UI_HELP.update({
    "cards.overview": {
        "title": "Overview (Month Summary)",
        "what": "Totals for the selected month: inflows, outflows, and net.",
        "how_to_read": [
            "Net = inflows − outflows. Positive = saved, negative = overspent.",
            "Use alongside Cashflow to understand drivers.",
        ],
        "tips": ["If something looks off, open Anomalies for this month."],
        "gotchas": ["Transfers may inflate inflows if present in your data."],
    },
    "charts.top_categories": {
        "title": "Top Categories (This Month)",
        "what": "Bar chart of spending by category for the selected month.",
        "how_to_read": [
            "Bars are sorted by spend; taller bar = more spend.",
            "Hover for amount and share of total outflows.",
        ],
        "tips": ["Use this to spot categories to trim (pair with What-If)."],
        "gotchas": ["“Unknown” = transactions without a category label."],
    },
    "charts.daily_flows": {
        "title": "Daily Flows (This Month)",
        "what": "Line chart of daily inflows, outflows, and net across the month.",
        "how_to_read": [
            "Green ≈ inflows, red ≈ outflows, blue ≈ net per day.",
            "Look for spikes and end-of-month trends.",
        ],
        "tips": ["Run Anomalies if you see a spike."],
        "gotchas": ["Sparse days can make lines jagged."],
    },
})
