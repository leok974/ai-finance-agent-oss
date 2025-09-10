# apps/backend/app/services/agent_detect.py
from __future__ import annotations
from typing import Tuple, Dict, Any, List
import re
from app.services.txns_nl_query import parse_nl_query, NLQuery
from app.config import settings

def detect_txn_query(user_text: str) -> Tuple[bool, NLQuery]:
    """
    Heuristic: reuse the NL parser; if it finds any strong signals, we treat this as a txn query.
    To avoid false positives in general chat, also require at least one explicit keyword
    related to transactions/spending or a currency-like pattern.
    """
    nlq = parse_nl_query(user_text)
    has_time = bool(nlq.start and nlq.end)
    has_amt  = (nlq.min_amount is not None) or (nlq.max_amount is not None)
    strong_intent = nlq.intent in {"sum","count","top_merchants","top_categories","average","by_day","by_week","by_month"}
    any_signal = bool(nlq.merchants or nlq.categories or has_time or has_amt or strong_intent)

    # Additional gating: keywords or currency pattern must be present
    text_low = user_text.lower()
    keywords = [
        "spend", "spent", "spending", "expense", "expenses",
        "transaction", "transactions", "charge", "charges",
        "merchant", "merchants", "category", "categories",
        "income", "paycheck", "salary", "top", "average", "count", "list", "show",
        "by day", "by week", "by month"
    ]
    kw_hit = any(k in text_low for k in keywords)
    currency_hit = bool(re.search(r"\$\s*\d|\d+\.\d{2}", user_text))

    return bool(any_signal and (kw_hit or currency_hit)), nlq


def infer_flow(user_text: str) -> str | None:
    """Infer flow filter from text: expenses vs income."""
    t = user_text.lower()
    if any(w in t for w in ["income", "paycheck", "salary", "refund", "credit"]):
        return "income"
    if any(w in t for w in ["spend", "spent", "expense", "expenses", "bill", "debit", "charge", "charges"]):
        return "expenses"
    return None


def _fmt_usd(v: float) -> str:
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.2f}"


def summarize_txn_result(result: Dict[str, Any]) -> str:
    """
    Deterministic, compact markdown summary for NL txn results.
    """
    intent = result.get("intent")
    filters = result.get("filters", {})
    res = result.get("result")

    parts: List[str] = []

    def _filters_line() -> str:
        frags = []
        m = ", ".join(filters.get("merchants") or [])
        c = ", ".join(filters.get("categories") or [])
        if m:
            frags.append(f"merchants: {m}")
        if c:
            frags.append(f"categories: {c}")
        if filters.get("start") and filters.get("end"):
            frags.append(f"window: {filters['start']} → {filters['end']}")
        if filters.get("min_amount") is not None:
            frags.append(f">= {_fmt_usd(float(filters['min_amount']))}")
        if filters.get("max_amount") is not None:
            frags.append(f"<= {_fmt_usd(float(filters['max_amount']))}")
        flow = filters.get("flow")
        if flow:
            frags.append(f"flow: {flow}")
        return "; ".join(frags)

    fl = _filters_line()
    if fl:
        parts.append(f"Filters: {fl}")

    if intent == "sum":
        total = float(res.get("total_abs", 0.0)) if isinstance(res, dict) else 0.0
        parts.append(f"Total spending: {_fmt_usd(total)}")
    elif intent == "count":
        cnt = int(res.get("count", 0)) if isinstance(res, dict) else 0
        parts.append(f"Transactions: {cnt}")
    elif intent == "average":
        avg = float(res.get("average_abs", 0.0)) if isinstance(res, dict) else 0.0
        parts.append(f"Average transaction: {_fmt_usd(avg)}")
    elif intent in ("top_merchants", "top_categories"):
        key = "merchant" if intent == "top_merchants" else "category"
        header = "Merchant" if intent == "top_merchants" else "Category"
        rows = res or []
        if not rows:
            parts.append("No matching transactions.")
        else:
            parts.append(f"{header} | Spend\n---|---")
            for r in rows[:10]:
                parts.append(f"{r.get(key) or '(Unknown)'} | {_fmt_usd(float(r.get('spend') or 0))}")
    elif intent in ("by_day", "by_week", "by_month"):
        rows = res or []
        label = {"by_day": "Day", "by_week": "Week", "by_month": "Month"}[intent]
        if not rows:
            parts.append("No matching transactions.")
        else:
            parts.append(f"{label} | Spend\n---|---")
            for r in rows[:12]:
                parts.append(f"{r.get('bucket')} | {_fmt_usd(float(r.get('spend') or 0))}")
    else:  # list
        rows = res or []
        if not rows:
            parts.append("No transactions found.")
        else:
            parts.append("Date | Merchant | Category | Amount\n---|---|---|---")
            for r in rows[:10]:
                parts.append(f"{r.get('date')} | {r.get('merchant')} | {r.get('category')} | {_fmt_usd(float(r.get('amount') or 0))}")
            page = result.get("filters", {}).get("page")
            page_size = result.get("filters", {}).get("page_size")
            if page and page_size:
                parts.append(f"Page {page} · {page_size} per page")

    return "\n".join(parts)


def try_llm_rephrase_summary(user_text: str, res: Dict[str, Any], summary: str) -> str | None:
    """
    Best-effort: ask the LLM to rephrase the deterministic summary more naturally,
    but DO NOT change amounts, counts, or date ranges. If not configured, return None.
    Controlled by settings and environment; non-fatal on any error.
    """
    # dev knob to skip LLM entirely
    if getattr(settings, "ENV", "dev") != "prod" and getattr(settings, "DEBUG", True):
        # allow opting in later; default off in dev
        return None
    try:
        from app.utils import llm as llm_mod
    except Exception:
        return None

    slim = {
        "intent": res.get("intent"),
        "filters": res.get("filters"),
        "result_preview": res.get("result")[:5] if isinstance(res.get("result"), list) else res.get("result"),
    }
    system = (
        "You will rephrase a financial summary that is already CORRECT.\n"
        "Rules:\n"
        "1) DO NOT change any numbers, totals, counts, or date ranges.\n"
        "2) Keep to one short, clear sentence.\n"
        "3) You may smooth wording but keep figures exact.\n"
        "4) If a range appears, include the same range intact.\n"
        "5) If listing top items, mention up to 3 in same order and amounts.\n"
        "6) Never invent data beyond the provided JSON."
    )
    user = (
        f"User text: {user_text}\n"
        f"Deterministic summary: {summary}\n"
        f"Structured (JSON):\n{__import__('json').dumps(slim, ensure_ascii=False)}"
    )
    try:
        reply, _trace = llm_mod.call_local_llm(
            model=getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b"),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.1,
            top_p=0.9,
        )
        text = (reply or "").strip()
        if not text or len(text) > 300:
            return None
        return text
    except Exception:
        return None
