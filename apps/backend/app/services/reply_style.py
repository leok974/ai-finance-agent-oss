"""
Conversational reply styling service.

Provides consistent voice across all agent responses:
- Primary LLM replies
- NL-tools responses
- Deterministic fallbacks

All replies use a friendly, concise, professional tone with dynamic context inserts.
"""

from typing import Optional, Dict, Any

DEFAULT_TONE: Dict[str, Any] = {
    "persona": "friendly, concise, professional, helpful",
    "rules": [
        "Use short sentences and plain language.",
        "Open with a friendly 1-line hook when appropriate.",
        "Answer directly first; put details or options after.",
        "Offer one next step when it's useful.",
        "Never over-apologize; be matter-of-fact.",
        "No emoji unless user uses them first.",
    ],
}


def _greeting(name: Optional[str]) -> str:
    """Generate personalized greeting with safe fallback."""
    # Runtime guard for type safety (caller may pass non-string despite type hint)
    if not isinstance(name, str):
        return "Hey —"

    # Strip whitespace and ensure non-empty
    clean_name = name.strip()
    if clean_name:
        return f"Hey {clean_name} —"
    return "Hey —"


def _context_line(ctx: Dict[str, Any]) -> str:
    """
    Build dynamic context line from available data.

    Examples:
        - "August 2025 · $608 spent · top merchant: Whole Foods"
        - "August 2025 · $608 spent"
        - "August 2025"
    """
    month = ctx.get("month_label")
    spend = ctx.get("month_spend")
    top_merchant = ctx.get("top_merchant")

    bits: list[str] = []
    if month:
        bits.append(str(month))
    if spend is not None:
        bits.append(f"${spend:,.0f} spent")
    if top_merchant:
        bits.append(f"top merchant: {top_merchant}")

    return " · ".join(bits)


def style_reply(
    content: str,
    *,
    user_name: Optional[str] = None,
    mode: str = "primary",
    context: Optional[Dict[str, Any]] = None,
    add_header: bool = True,
) -> str:
    """
    Wrap any raw reply (LLM/tool/deterministic) with a consistent voice.

    Args:
        content: Raw reply text from LLM, tool, or deterministic path
        user_name: Optional user name for personalized greeting
        mode: Reply mode - "primary" | "nl_txns" | "deterministic" | "fallback"
        context: Dict with dynamic inserts (month_label, month_spend, top_merchant, next_suggest)
        add_header: Whether to add greeting + context line

    Returns:
        Styled reply with consistent conversational tone

    Examples:
        Primary LLM:
            Hey —
            August 2025 · $608 spent · top merchant: Whole Foods

            You spent $608 this month, slightly above your 3-month average.
            _Tip:_ Want me to break that down by category?

        Deterministic:
            Hey —
            August 2025 · $608 spent

            Here's a quick snapshot using cached metrics: $608 outflows.
            _Tip:_ Want me to re-run this with the model for deeper analysis?
    """
    ctx = context or {}
    lines: list[str] = []

    if add_header:
        lines.append(_greeting(user_name))
        ctx_line = _context_line(ctx)
        if ctx_line:
            lines.append(ctx_line)
            lines.append("")  # blank line

    # Core content (already computed by LLM or tools)
    lines.append(content.strip())

    # Helpful next step (lightweight & optional)
    if mode in ("primary", "nl_txns"):
        lines.append("")
        suggestion = (
            ctx.get("next_suggest")
            or "Want me to break that down by category or flag unusual spikes?"
        )
        lines.append(f"_Tip:_ {suggestion}")
    elif mode in ("deterministic", "fallback"):
        lines.append("")
        suggestion = (
            ctx.get("next_suggest")
            or "Want me to re-run this with the model for a deeper explanation?"
        )
        lines.append(f"_Tip:_ {suggestion}")

    return "\n".join(lines)


# System prompt for LLM to write in this style natively
CONVERSATIONAL_SYSTEM_PROMPT = """You are an assistant with a friendly, concise, professional tone.

Voice guidelines:
- Use short sentences and plain language
- Start with a warm one-liner when appropriate ("Hey — …")
- Answer the question first, then add 1 helpful next step
- No emojis unless the user uses them first
- Keep replies scannable; avoid long lists unless asked
- If you cite data (month, totals, merchants), use the values provided in tool context
- Never over-apologize; be matter-of-fact

When you have context about the user's finances (month, spend, merchants), reference it naturally.
"""
