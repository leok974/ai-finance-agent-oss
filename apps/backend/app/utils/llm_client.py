from __future__ import annotations

from typing import Optional
import os

from app.config import settings
from app.utils import llm as llm_mod


def try_complete(prompt: str, max_tokens: int = 60, temperature: float = 0.2) -> Optional[str]:
    """Best-effort single-turn completion using our chat API.

    Returns None on error or when LLM is disabled in dev.
    """
    # Allow skipping entirely in dev without an LLM
    if os.getenv("DEV_ALLOW_NO_LLM", "0") == "1":
        return None
    try:
        reply, _trace = llm_mod.call_local_llm(
            model=getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b"),
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            top_p=0.9,
        )
        return (reply or "").strip() or None
    except Exception:
        return None
