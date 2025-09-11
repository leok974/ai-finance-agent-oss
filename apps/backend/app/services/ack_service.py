from __future__ import annotations

import json
import os
from typing import Optional, Dict, Any

# Soft-fail LLM wrapper (returns None when disabled/errored)
from app.utils.llm_client import try_complete


# When ACK_ASCII=1, we force plain ASCII output for all ack strings.
_ACK_ASCII = os.getenv("ACK_ASCII", "0") in ("1", "true", "True")


def _to_ascii(text: str) -> str:
    """Best-effort ASCII normalization for UX in constrained environments.

    Replaces common punctuation and symbols with ASCII equivalents and strips remaining non-ASCII.
    """
    if not text:
        return text
    replacements = {
        "\u2014": "-",  # em dash —
        "\u2013": "-",  # en dash –
        "\u2019": "'",  # right single quote ’
        "\u2018": "'",  # left single quote ‘
        "\u201c": '"',  # left double quote “
        "\u201d": '"',  # right double quote ”
        "\u2026": "...",  # ellipsis …
        "\u2192": "->",  # right arrow →
        "\xa0": " ",  # non-breaking space
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    # strip remaining non-ascii chars
    try:
        text = text.encode("ascii", "ignore").decode("ascii")
    except Exception:
        pass
    return text


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
        out = f"{base} ({updated_count} updated)."
    else:
        out = base + "."

    return _to_ascii(out) if _ACK_ASCII else out


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
        text = text.strip().strip('"')
        return _to_ascii(text) if _ACK_ASCII else text
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
