from __future__ import annotations

import json
from typing import Optional, Dict, Any

# Soft-fail LLM wrapper (returns None when disabled/errored)
from app.utils.llm_client import try_complete


PROMPT = (
    """You are a concise, friendly assistant.
Write ONE short sentence (<= 20 words) acknowledging a learning action.
- Do NOT invent numbers.
- Use plain language.
Input (JSON):
{payload}
Output (one sentence only):"""
)


def deterministic_ack(
    merchant: Optional[str],
    category: Optional[str],
    updated_count: Optional[int] = None,
    scope: str = "future",  # "future" | "similar"
) -> str:
    m = merchant or "this merchant"
    c = category or "this category"
    if scope == "similar":
        base = f"Got it — I’ll treat {m} as {c} and update similar items"
    else:
        base = f"Got it — I’ll treat {m} as {c} going forward"

    if isinstance(updated_count, int) and updated_count > 0:
        return f"{base} ({updated_count} updated)."
    return base + "."


def llm_ack(
    merchant: Optional[str],
    category: Optional[str],
    updated_count: Optional[int] = None,
    scope: str = "future",
) -> Optional[str]:
    payload = {
        "merchant": merchant,
        "category": category,
        "updated_count": updated_count if isinstance(updated_count, int) and updated_count > 0 else None,
        "scope": scope,
    }
    text = try_complete(PROMPT.format(payload=json.dumps(payload, ensure_ascii=False)), max_tokens=40, temperature=0.2)
    if text:
        return text.strip().strip('"')
    return None


def build_ack(
    merchant: Optional[str],
    category: Optional[str],
    updated_count: Optional[int],
    scope: str,
) -> Dict[str, Any]:
    det = deterministic_ack(merchant, category, updated_count, scope)
    llm = llm_ack(merchant, category, updated_count, scope)
    ack: Dict[str, Any] = {"deterministic": det, "mode": "deterministic"}
    if llm:
        ack["llm"] = llm
        ack["mode"] = "llm"
    return ack
