# -*- coding: utf-8 -*-
"""
Text utilities shared across services/models.

canonicalize_merchant: lowercases, strips diacritics/punctuation, collapses spaces.
Examples:
  "  Café—Gamma  " -> "cafe gamma"
  "Starbucks Store #123" -> "starbucks store 123"
"""
from __future__ import annotations
import re
import unicodedata
from typing import Optional

_WS_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)


def _strip_diacritics(s: str) -> str:
    # NFKD then drop combining marks
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch)
    )


def canonicalize_merchant(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    s = val.strip().lower()
    s = _strip_diacritics(s)
    # replace punctuation with space, then collapse spaces
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s or None
