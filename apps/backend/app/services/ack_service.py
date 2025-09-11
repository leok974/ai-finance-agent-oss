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
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    m = merchant or "this merchant"
    c = category or "this category"
    if scope == "similar":
        base = f"Got it — I’ll treat {m} as {c} and update similar items"
    else:
        base = f"Got it — I’ll treat {m} as {c} going forward"

    # Build compact suffix with counts/extra if provided
    suffix_parts = []
    if isinstance(updated_count, int) and updated_count > 0:
        suffix_parts.append(f"{updated_count} updated")
    if extra:
        kv = ", ".join(f"{k}={v}" for k, v in extra.items())
        if kv:
            suffix_parts.append(kv)
    out = base + (f" (" + ", ".join(suffix_parts) + ")" if suffix_parts else "") + "."

    return _to_ascii(out) if _ACK_ASCII else out


def llm_ack(
    merchant: Optional[str],
    category: Optional[str],
    updated_count: Optional[int] = None,
    scope: str = "future",
    extra: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    payload = {
        "merchant": merchant,
        "category": category,
        "updated_count": updated_count if isinstance(updated_count, int) and updated_count > 0 else None,
    "scope": scope,
    "extra": (extra or {}),
    }
    text = try_complete(PROMPT.format(payload=json.dumps(payload, ensure_ascii=False)), max_tokens=40, temperature=0.2)
    if text:
        text = text.strip().strip('"')
        return _to_ascii(text) if _ACK_ASCII else text
    return None


def _deterministic_scope_ack(scope: str, updated_count: Optional[int] = None, extra: Optional[Dict[str, Any]] = None) -> str:
    base = f"{scope}:"
    details = []
    if isinstance(updated_count, int):
        details.append(f"{updated_count} update(s)")
    if extra:
        kv = ", ".join(f"{k}={v}" for k, v in extra.items())
        if kv:
            details.append(kv)
    out = base + (" " + ", ".join(details) if details else " done")
    return _to_ascii(out) if _ACK_ASCII else out


def build_ack(
    merchant: Optional[str] = None,
    category: Optional[str] = None,
    updated_count: Optional[int] = None,
    scope: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build an acknowledgment object.

    Back-compat:
    - Legacy form: build_ack(merchant, category, updated_count, scope="future|similar")
    - Scope-only form: build_ack(scope="planner.apply", updated_count=..., extra={...})
    """
    # Scope-only pathway (used by planner and other aggregate actions)
    if (merchant is None and category is None) and scope:
        det = _deterministic_scope_ack(scope, updated_count, extra)
        return {"deterministic": det, "mode": "deterministic"}

    # Legacy merchant/category pathway
    det = deterministic_ack(merchant, category, updated_count, scope or "future", extra)
    llm = llm_ack(merchant, category, updated_count, scope or "future", extra)
    ack: Dict[str, Any] = {"deterministic": det, "mode": "deterministic"}
    if llm:
        ack["llm"] = llm
        ack["mode"] = "llm"
    return ack
