"""Heuristic-based category suggestion (baseline, never-empty)."""

from __future__ import annotations
from typing import List, Dict
import re

# Simple merchant priors and regex rules; extend via DB later.
MERCHANT_PRIORS = {
    # P2P / Transfers
    "zelle": "transfers",
    "venmo": "transfers",
    "cash app": "transfers",
    "sqc*": "transfers",
    "paypal": "transfers",
    "apple cash": "transfers",
    "now withdrawal": "transfers",
    # Groceries
    "harris teeter": "groceries",
    "costco": "groceries",
    "kroger": "groceries",
    "whole foods": "groceries",
    "trader joe": "groceries",
    # Shopping
    "amazon": "shopping",
    "target": "shopping",
    "walmart": "shopping",
    # Food delivery
    "doordash": "restaurants",
    "uber eats": "restaurants",
    # Transportation
    "uber": "transportation",
    "lyft": "transportation",
    "shell": "transportation.fuel",
    "chevron": "transportation.fuel",
    "bp": "transportation.fuel",
    # Coffee
    "starbucks": "coffee",
    "dunkin": "coffee",
}

REGEX_RULES = [
    (re.compile(r"\b(RENT|Rent)\b"), "housing"),
    (re.compile(r"\b(INSUR|Insurance)\b"), "health.insurance"),
    (re.compile(r"\b(GYM|FITNESS)\b"), "health"),
    (re.compile(r"\b(ZELLE|Zelle|NOW WITHDRAWAL)\b"), "transfers"),
    (re.compile(r"\b(VENMO|Venmo)\b"), "transfers"),
    (re.compile(r"\b(CASH APP|SQC\*)\b"), "transfers"),
]

BUDGET_CAPS = {
    "groceries": 2000.0,
    "shopping": 3000.0,
    "transportation": 1500.0,
    "restaurants": 1000.0,
    "transfers": 5000.0,
}


def normalize(text: str) -> str:
    """Normalize text for matching."""
    return (text or "").lower().strip()


def score_candidate(label: str, memo: str, amount: float) -> float:
    """Score a candidate label based on context."""
    base = 0.6
    # Light shaping by amount vs budget cap
    cap = BUDGET_CAPS.get(label)
    if cap:
        ratio = max(0.0, min(1.0, 1 - (abs(amount) / cap)))
        base += 0.2 * ratio
    # Regex bonus if label implied by memo tokens
    tokens = memo.split()
    if label.lower() in tokens:
        base += 0.05
    return max(0.01, min(0.99, base))


def suggest_for_txn(txn: Dict) -> List[Dict]:
    """Return candidate list of {label, confidence, reasons[]} ordered by confidence.

    Args:
        txn: Transaction dict with keys: amount, merchant, memo, name, payee

    Returns:
        List of candidates sorted by confidence (highest first)
    """
    merchant = normalize(txn.get("merchant") or txn.get("name") or txn.get("payee", ""))
    memo = normalize(txn.get("memo") or "")
    amount = float(txn.get("amount") or 0)

    cands = []

    # 1) Merchant priors
    for key, label in MERCHANT_PRIORS.items():
        if key in merchant:
            conf = score_candidate(label, memo, amount)
            cands.append(
                {
                    "label": label,
                    "confidence": conf,
                    "reasons": [f"merchant_prior:{key}"],
                }
            )

    # 2) Regex rules on memo
    for pattern, label in REGEX_RULES:
        if pattern.search(memo):
            conf = score_candidate(label, memo, amount)
            cands.append(
                {
                    "label": label,
                    "confidence": conf,
                    "reasons": [f"regex:{pattern.pattern}"],
                }
            )

    # 3) Fallback simple channel tokens
    if not cands:
        if (
            "zelle" in merchant
            or "zelle" in memo
            or "now withdrawal" in merchant
            or "now withdrawal" in memo
        ):
            cands.append(
                {"label": "transfers", "confidence": 0.75, "reasons": ["token:zelle"]}
            )
        elif "venmo" in merchant or "venmo" in memo:
            cands.append(
                {"label": "transfers", "confidence": 0.75, "reasons": ["token:venmo"]}
            )
        elif "cash app" in merchant or "sqc*" in merchant:
            cands.append(
                {
                    "label": "transfers",
                    "confidence": 0.75,
                    "reasons": ["token:cash_app"],
                }
            )
        elif "deposit" in memo:
            cands.append(
                {"label": "income", "confidence": 0.70, "reasons": ["token:deposit"]}
            )
        else:
            cands.append(
                {"label": "unknown", "confidence": 0.40, "reasons": ["fallback"]}
            )

    cands.sort(key=lambda x: x["confidence"], reverse=True)
    return cands
