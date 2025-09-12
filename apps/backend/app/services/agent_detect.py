# apps/backend/app/services/agent_detect.py
from __future__ import annotations
from typing import Tuple, Dict, Any, List
import re
from app.services.txns_nl_query import parse_nl_query, NLQuery
from app.config import settings
import re as _re

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

    # Compose a tightly scoped prompt to avoid data drift
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


# ---------------- Budget detectors ----------------
def detect_budget_recommendation(text: str) -> bool:
    """Conservative match for explicit budget recommendation requests."""
    t = (text or "").lower()
    keys = [
        "budget recommendation",
        "smart budget",
        "what should my budget be",
        "how much to budget",
        "recommend a budget",
    ]
    return any(k in t for k in keys)


def extract_months_or_default(text: str, default: int = 6) -> int:
    """Extract a small integer months window if user specifies (e.g., 'last 6 months')."""
    try:
        t = (text or "").lower()
        m = _re.search(r"(?:last|past|over|for)\s+(\d{1,2})\s+month", t)
        if m:
            val = int(m.group(1))
            if 3 <= val <= 24:
                return val
        # Also catch bare "12 months"
        m2 = _re.search(r"\b(\d{1,2})\s+months?\b", t)
        if m2:
            val = int(m2.group(1))
            if 3 <= val <= 24:
                return val
    except Exception:
        pass
    return int(default)


# ---------------- Anomalies detector ----------------
class Detector:
    """
    Lightweight intent detector for agent routing.
    Provides explicit anomaly detection with parameter extraction.
    """

    # Existing detectors could be added as methods later as needed.

    def detect_anomalies(self, text: str) -> bool:
        t = (text or "").lower()
        keys = [
            "anomal",        # anomaly, anomalies, anomalous
            "unusual",
            "spike", "spiking",
            "weird", "odd",
            "outlier", "outliers",
            "surge", "dip",
        ]
        return any(k in t for k in keys)

    def extract_anomaly_params(
        self,
        text: str,
        *,
        default_months: int = 6,
        default_min: float = 50.0,
        default_threshold: float = 0.4,
        default_max: int = 8,
    ) -> dict:
        """
        Very light NLP: pull ints/floats if they look like 'last 12 months' or 'threshold 30%'.
        Fall back to sensible defaults.
        """
        t = (text or "").lower()
        months = default_months
        threshold = default_threshold
        min_amt = default_min
        max_results = default_max

        import re
        m = re.search(r"(?:last\s+)?(\d{1,2})\s+months?", t)
        if m:
            months = max(3, min(24, int(m.group(1))))
        m = re.search(r"threshold\s+(\d{1,3})\s*%?", t)
        if m:
            threshold = max(0.05, min(5.0, float(m.group(1)) / 100.0))
        m = re.search(r"min(?:imum)?\s+(\d+(?:\.\d+)?)", t)
        if m:
            min_amt = float(m.group(1))
        m = re.search(r"top\s+(\d{1,2})", t)
        if m:
            max_results = max(1, min(50, int(m.group(1))))
        return {"months": months, "min": min_amt, "threshold": threshold, "max": max_results}

    # ---- New detectors ----------------------------------------------------
    def detect_open_category_chart(self, text: str) -> bool:
        t = (text or "").lower()
        return any(k in t for k in ["category chart", "chart for", "open chart", "category trend", "timeseries", "time series"]) and not self.detect_anomalies(text)

    def extract_chart_params(self, text: str, *, default_months: int = 6) -> dict:
        t = (text or "").strip()
        months = extract_months_or_default(t, default=default_months)
        # naive category capture: text after 'for' or before 'chart'
        cat = None
        m = _re.search(r"(?:for\s+)([A-Za-z][A-Za-z &/+-]+?)(?=\s+(?:over|for|to|in|last|this|these|next|of)\b|\s*$)", t, _re.IGNORECASE)
        if m:
            cat = m.group(1).strip().rstrip(".?!").title()
        else:
            m2 = _re.search(r"^(?:show|open)?\s*([A-Za-z][A-Za-z &/+-]+)\s+chart", t, _re.IGNORECASE)
            if m2:
                cat = m2.group(1).strip().title()
        return {"category": cat, "months": months}

    def detect_temp_budget(self, text: str) -> bool:
        t = (text or "").lower()
        # require 'temp' or 'temporary' plus 'budget' to avoid collisions
        return ("budget" in t) and any(k in t for k in ["temp", "temporary"]) and not self.detect_anomalies(text)

    def extract_temp_budget_params(self, text: str) -> dict:
        t = (text or "").strip()
        # category: after 'for' or before 'to'
        cat = None
        m = _re.search(r"for\s+([A-Za-z][A-Za-z &/+-]+?)(?:\s+to\b|\s*$)", t, _re.IGNORECASE)
        if m:
            cat = m.group(1).strip().rstrip(".?!").title()
        # amount: $500 or 500
        amt = None
        m2 = _re.search(r"\$?\s*(\d+(?:\.\d{1,2})?)\b", t)
        if m2:
            try:
                amt = float(m2.group(1))
            except Exception:
                pass
        # month: detect 'this month' or explicit 'in <Month YYYY>' parsed upstream
        when = None
        if _re.search(r"this\s+month", t, _re.IGNORECASE):
            when = "this"
        return {"category": cat, "amount": amt, "when": when}

    def detect_anomaly_ignore(self, text: str) -> bool:
        t = (text or "").lower()
        return any(k in t for k in ["ignore", "hide"]) and any(k in t for k in ["anomaly", "anomalies"]) 

    def extract_anomaly_ignore_params(self, text: str) -> dict:
        t = (text or "").strip()
        # patterns: 'ignore Transport anomalies', 'hide anomalies for Groceries'
        cat = None
        m = _re.search(r"(?:ignore|hide)\s+([A-Za-z][A-Za-z &/+-]+?)\s+anomal", t, _re.IGNORECASE)
        if m:
            cat = m.group(1).strip().title()
        else:
            m2 = _re.search(r"anomal(?:y|ies)\s+for\s+([A-Za-z][A-Za-z &/+-]+)", t, _re.IGNORECASE)
            if m2:
                cat = m2.group(1).strip().title()
        return {"category": cat}


# Optional thin wrappers if code elsewhere expects module-level functions
def detect_anomalies(text: str) -> bool:
    return Detector().detect_anomalies(text)


def extract_anomaly_params(text: str, **kwargs) -> dict:
    return Detector().extract_anomaly_params(text, **kwargs)

