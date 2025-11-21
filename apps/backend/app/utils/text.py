# -*- coding: utf-8 -*-
"""
Text utilities shared across services/models.

canonicalize_merchant: lowercases, strips diacritics/punctuation, collapses spaces,
and removes store numbers and trailing address tokens for better merchant matching.
Examples:
  "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON" -> "cvs pharmacy"
  "HARRIS TEETER #0085 12960 HIGHLAND CROS" -> "harris teeter"
  "  Café—Gamma  " -> "cafe gamma"
  "Starbucks Store #123" -> "starbucks"
  "CapCut Singapore" -> "capcut singapore"
"""
from __future__ import annotations
import re
import unicodedata
from typing import Optional

_WS_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)

# Pattern to match store/location numbers like "#02006", "#0085", "STORE 123", etc.
_STORE_NUM_RE = re.compile(r"\s*#?\s*\d{3,5}\b", re.IGNORECASE)

# Common business suffixes to remove (case-insensitive)
_BUSINESS_SUFFIXES = [
    r"\bstore\b",
    r"\blocation\b",
    r"\bbranch\b",
    r"\bllc\b",
    r"\binc\b",
    r"\bcorp\b",
    r"\bltd\b",
]
_SUFFIX_RE = re.compile("|".join(_BUSINESS_SUFFIXES), re.IGNORECASE)


def _strip_diacritics(s: str) -> str:
    # NFKD then drop combining marks
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch)
    )


def canonicalize_merchant(val: Optional[str]) -> Optional[str]:
    """
    Normalize merchant name for matching against hints and rules.

    Process:
    1. Strip, lowercase, remove diacritics
    2. Replace punctuation with spaces
    3. Remove store numbers (#02006, #0085, etc.)
    4. Remove common business suffixes (store, llc, inc, corp, etc.)
    5. Keep only first 2 meaningful tokens (remove trailing addresses)
    6. Collapse spaces

    Examples:
        "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON" -> "cvs pharmacy"
        "HARRIS TEETER #0085 12960 HIGHLAND CROS" -> "harris teeter"
        "CapCut Singapore" -> "capcut singapore"
        "TARGET T-1088" -> "target"
        "Acme Corp LLC" -> "acme"
    """
    if not val:
        return None

    s = val.strip().lower()
    s = _strip_diacritics(s)

    # Replace punctuation with spaces
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()

    # Remove store/location numbers
    s = _STORE_NUM_RE.sub("", s).strip()

    # Remove common business suffixes (do this BEFORE token truncation)
    s = _SUFFIX_RE.sub("", s).strip()

    # Collapse multiple spaces
    s = _WS_RE.sub(" ", s).strip()

    # Keep only first 2 meaningful tokens to ensure consistent matching
    # Most merchant names are 1-2 words; anything after is usually location/address
    tokens = s.split()

    if len(tokens) > 2:
        # Keep only first 2 tokens, removing address/location data
        tokens = tokens[:2]
    elif len(tokens) == 2:
        # For 2-token merchants, check if 2nd token is very short (like "T" in "TARGET T")
        if len(tokens[1]) <= 2:
            tokens = tokens[:1]

    s = " ".join(tokens)
    return s or None
