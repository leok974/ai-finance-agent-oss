"""
Test intent-specific system hints and context trimming functionality.
"""

# Copy the intent hints from agent.py
INTENT_HINTS = {
    "general": "Answer budgeting and transaction questions using CONTEXT. Be helpful and reference specific data points.",
    "explain_txn": "Explain the specific transaction in CONTEXT.txn. Provide category suggestion, similar transactions, rule matches, and actionable next steps.",
    "budget_help": "Focus on budgets, categories, and month-over-month deltas. Help with budget planning and spending analysis.",
    "rule_seed": "Propose a precise rule pattern and its category. Be specific about merchant matching and suggest optimal categorization rules.",
}

BASE_SYSTEM_PROMPT = """You are Finance Agent. You see a CONTEXT JSON with month summary,
rules, alerts, insights, suggestions, and (optionally) a specific transaction.

Rules:
- Be concise. Use bullets and short paragraphs.
- Always reference where your answer comes from (e.g., "(rule #14, month_summary.income, merchant: 'Spotify')").
- If unsure, say so and suggest a small next step.
- If intent = explain_txn, include:
  (1) probable category with 1–2 sentence reason,
  (2) 1–2 similar merchants this month,
  (3) any rule that almost matched,
  (4) one actionable next step ("create rule", "mark as transfer", etc.).
"""


def build_system_prompt(intent: str) -> str:
    """Build enhanced system prompt with intent-specific hints."""
    intent_hint = INTENT_HINTS.get(intent, INTENT_HINTS["general"])
    return f"{BASE_SYSTEM_PROMPT}\n\n{intent_hint}"


if __name__ == "__main__":
    print("=== Intent-Specific System Prompts ===\n")

    test_intents = ["general", "explain_txn", "budget_help", "rule_seed"]

    for intent in test_intents:
        prompt = build_system_prompt(intent)
        print(f"Intent: {intent}")
        print("=" * 40)
        print(prompt)
        print("\n" + "=" * 60 + "\n")
