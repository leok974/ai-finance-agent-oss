from __future__ import annotations
from typing import Dict, List, Tuple, Optional, Any, cast
from collections import defaultdict, Counter
from datetime import date as _date, datetime as _dt
import math
import statistics as stats

from sqlalchemy.orm import Session
import time
import logging

from app.transactions import Transaction
from app.agent.prompts import (
    FINANCE_RECURRING_PROMPT,
    FINANCE_FIND_SUBSCRIPTIONS_PROMPT,
)

try:  # avoid importing heavy stack (pandas/statsmodels) during hermetic test startup
    from .analytics_forecast import sarimax_cashflow_forecast, sarimax_forecast  # type: ignore
except Exception:  # pragma: no cover

    def sarimax_cashflow_forecast(db: Session, base_series_fn: Any, month: Optional[str], horizon: int) -> Optional[Dict[Any, Any]]:  # type: ignore[unused-ignore]
        return None

    def sarimax_forecast(month_series: Dict[str, float], horizon: int = 3, seasonal_periods: int = 12, alpha: float = 0.2) -> Optional[Tuple[List[float], List[float], List[float]]]:  # type: ignore[unused-ignore]
        return None


log = logging.getLogger(__name__)


class _Timed:
    def __init__(self, label: str):
        self.label = label
        self.t0 = 0.0

    def __enter__(self):
        self.t0 = time.perf_counter()
        return self

    def __exit__(self, *exc):
        try:
            dt_ms = int((time.perf_counter() - self.t0) * 1000)
            log.info("analytics.%s duration_ms=%s", self.label, dt_ms)
        except Exception:
            pass


def _parse_month(s: str) -> Tuple[int, int]:
    y, m = s.split("-")
    return int(y), int(m)


def _month_key(d: _date | _dt) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _months_window(
    all_months: List[str], ref_month: Optional[str], lookback: int
) -> List[str]:
    if not all_months:
        return []
    # Ensure mypy understands this remains a list[str]
    all_months_list: List[str] = sorted(set(all_months))  # dedupe & sort
    all_months = all_months_list
    if ref_month and ref_month in all_months:
        end_idx = all_months.index(ref_month)
    else:
        end_idx = len(all_months) - 1
    start_idx = max(0, end_idx - max(0, lookback - 1))
    # Return slice from the typed list so mypy infers List[str]
    return all_months_list[start_idx : end_idx + 1]


def _fetch_txns_window(db: Session, months: List[str]) -> List[Transaction]:
    if not months:
        return cast(List[Transaction], [])
    rows = db.query(Transaction).filter(Transaction.month.in_(months)).all()
    return cast(List[Transaction], rows)


def _monthly_sums(
    db: Session, lookback: int, ref_month: Optional[str]
) -> Tuple[Dict[str, Dict[str, float]], Dict[str, List[Dict]]]:
    """Portable monthly aggregator over Transaction rows.
    Returns (series, txns_by_month) where series[month] = {in,out,net} and
    txns_by_month[month] = list of dicts for downstream analytics.
    """
    # Get all known months
    all_months = [m for (m,) in db.query(Transaction.month).distinct().all() if m]
    months = _months_window(all_months, ref_month, lookback)
    txns = _fetch_txns_window(db, months)
    series: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {"in": 0.0, "out": 0.0, "net": 0.0}
    )
    txns_by_month: Dict[str, List[Dict]] = defaultdict(list)
    for t in txns:
        m = t.month
        amt = float(t.amount or 0.0)
        if amt >= 0:
            series[m]["in"] += amt
        else:
            series[m]["out"] += abs(amt)
        # carry minimal fields to keep outputs stable
        txns_by_month[m].append(
            {
                "date": t.date,
                "amount": amt,
                "merchant": t.merchant_canonical or t.merchant or "",
                "category": t.category or "",
            }
        )
    for m in list(series.keys()):
        series[m]["net"] = series[m]["in"] - series[m]["out"]
    return dict(series), dict(txns_by_month)


def compute_kpis(db: Session, month: Optional[str] = None, lookback: int = 6) -> Dict:
    with _Timed("kpis"):
        lookback = max(1, min(24, int(lookback or 6)))
        series, _ = _monthly_sums(db, lookback, month)
    months = sorted(series.keys())
    if not months:
        return {"months": [], "series": {}, "kpis": {}}

    inflows = [series[m]["in"] for m in months]
    outflows = [series[m]["out"] for m in months]
    nets = [series[m]["net"] for m in months]

    def _avg(xs):
        return (sum(xs) / len(xs)) if xs else 0.0

    avg_out = _avg(outflows)
    avg_in = _avg(inflows)
    avg_net = _avg(nets)
    savings_rate = (avg_net / avg_in) if avg_in > 0 else 0.0

    def _cov(xs):
        if not xs:
            return 0.0
        mu = sum(xs) / len(xs)
        if mu == 0:
            return 0.0
        var = sum((x - mu) ** 2 for x in xs) / len(xs)
        return (var**0.5) / mu

    kpis = {
        "avg_inflows": avg_in,
        "avg_outflows": avg_out,
        "avg_net": avg_net,
        "savings_rate": savings_rate,
        "income_volatility": _cov(inflows),
        "merchant_concentration": None,
    }

    # Compute simple HHI for last month's spend share by merchant
    last = months[-1]
    _, by_month = _monthly_sums(db, 1, last)
    spend_by_merch: Dict[str, float] = defaultdict(float)
    for t in by_month.get(last, []):
        if t["amount"] < 0:
            spend_by_merch[t["merchant"]] += abs(t["amount"])
    total = sum(spend_by_merch.values()) or 1.0
    shares = [v / total for v in spend_by_merch.values()]
    hhi = sum((s * 100) ** 2 for s in shares) / 10000.0
    kpis["merchant_concentration"] = hhi

    return {"months": months, "series": series, "kpis": kpis}


def _ema(xs: List[float], alpha: float = 0.5) -> List[float]:
    if not xs:
        return []
    s = xs[0]
    out = [s]
    for x in xs[1:]:
        s = alpha * x + (1 - alpha) * s
        out.append(s)
    return out


def forecast_cashflow(
    db: Session,
    month: Optional[str] = None,
    horizon: int = 3,
    model: Optional[str] = None,
    alpha: Optional[float] = None,
) -> Dict:
    with _Timed("forecast_cashflow"):
        horizon = max(1, min(12, int(horizon or 3)))
        series, _ = _monthly_sums(db, lookback=36, ref_month=month)

    MIN_MONTHS = 3
    months = sorted(series.keys())
    history_months = len(months)

    # Check for insufficient history
    if history_months < MIN_MONTHS:
        return {
            "ok": False,
            "has_history": False,
            "reason": (
                f"Not enough history to forecast. Need at least {MIN_MONTHS} "
                f"months with non-zero activity; found {history_months}."
            ),
            "months": months,
            "series": series,
            "forecast": [],
            "model": "none",
        }

    # Check if all months have near-zero activity (no meaningful data)
    nets = [series[m]["net"] for m in months]
    ins = [series[m]["in"] for m in months]
    outs = [series[m]["out"] for m in months]
    has_activity = (
        any(abs(n) >= 1.0 for n in nets)
        or any(abs(i) >= 1.0 for i in ins)
        or any(abs(o) >= 1.0 for o in outs)
    )

    if not has_activity:
        return {
            "ok": False,
            "has_history": False,
            "reason": (
                f"Not enough history to forecast. Found {history_months} months "
                "but all have near-zero activity. Upload transactions with real amounts."
            ),
            "months": months,
            "series": series,
            "forecast": [],
            "model": "none",
        }

    infl = [series[m]["in"] for m in months]
    outf = [series[m]["out"] for m in months]
    nets = {m: series[m]["net"] for m in months}

    # Configure model selection
    model = (model or "auto").lower()
    ci_alpha = 0.20 if alpha is None else float(alpha)
    used_model = "ema"
    net_ci_low: Optional[List[float]] = None
    net_ci_high: Optional[List[float]] = None
    fc_net: Optional[List[float]] = None

    if model in ("auto", "sarimax"):
        try:
            sar_out = sarimax_forecast(
                nets, horizon=horizon, seasonal_periods=12, alpha=ci_alpha
            )
        except Exception:
            sar_out = None
        if sar_out is not None:
            fc_net, net_ci_low, net_ci_high = sar_out
            used_model = "sarimax"
        elif model == "sarimax":
            return {
                "ok": False,
                "has_history": True,
                "reason": "sarimax_unavailable",
                "months": months,
                "series": series,
                "forecast": [],
                "model": "none",
            }

    ema_in, ema_out = _ema(infl), _ema(outf)

    def _proj(last_seq: List[float]) -> List[float]:
        last = last_seq[-1]
        return [last for _ in range(horizon)]

    if fc_net is None:
        f_in = _proj(ema_in)
        f_out = _proj(ema_out)
        f_net = [round(a - b, 2) for a, b in zip(f_in, f_out)]
    else:
        # Split NET into IN/OUT using last observed mix; keep non-negative
        last_in, last_out = infl[-1], outf[-1]
        denom = (last_in + last_out) or 1.0
        ratio = max(0.0, min(1.0, last_in / denom))
        f_net = [round(n, 2) for n in fc_net]
        f_in = [round(max(0.0, n * ratio), 2) for n in fc_net]
        f_out = [round(max(0.0, n * (1.0 - ratio)), 2) for n in fc_net]

    forecast = [
        (
            lambda i: (
                {
                    **{
                        "t": i + 1,
                        "inflows": f_in[i],
                        "outflows": f_out[i],
                        "net": f_net[i],
                    },
                    **(
                        {
                            "net_ci": [
                                round(float(net_ci_low[i]), 2),
                                round(float(net_ci_high[i]), 2),
                            ]
                        }
                        if (used_model == "sarimax" and net_ci_low and net_ci_high)
                        else {}
                    ),
                }
            )
        )(i)
        for i in range(horizon)
    ]
    resp: Dict = {
        "months": months,
        "series": series,
        "forecast": forecast,
        "model": used_model,
        "ok": True,
        "has_history": True,
        "reason": None,
    }
    if used_model == "sarimax":
        resp["ci_alpha"] = ci_alpha
    return resp


def find_anomalies(db: Session, month: Optional[str] = None, lookback: int = 6) -> Dict:
    with _Timed("anomalies"):
        lookback = max(1, min(24, int(lookback or 6)))
        series, by_month = _monthly_sums(db, lookback, month)
    months = sorted(series.keys())
    last = months[-1] if months else None
    txns = by_month.get(last, []) if last else []
    amounts = [abs(t["amount"]) for t in txns if t["amount"] < 0]
    if len(amounts) < 6:
        return {"month": last, "items": []}
    q1, q3 = stats.quantiles(amounts, n=4)[0], stats.quantiles(amounts, n=4)[2]
    iqr = q3 - q1
    high = q3 + 1.5 * iqr
    median = stats.median(amounts)
    mad = stats.median([abs(a - median) for a in amounts]) or 1.0

    flagged = []
    for t in txns:
        if t["amount"] >= 0:
            continue
        mag = abs(t["amount"])
        robust_z = 0.6745 * (mag - median) / mad
        if mag >= high or robust_z >= 3.5:
            flagged.append(
                {
                    "date": (
                        t["date"].isoformat()
                        if hasattr(t["date"], "isoformat")
                        else str(t["date"])
                    ),
                    "merchant": t["merchant"],
                    "category": t["category"],
                    "amount": mag,
                    "reason": "IQR" if mag >= high else "robust_z",
                }
            )
    return {
        "month": last,
        "items": sorted(flagged, key=lambda x: x["amount"], reverse=True),
    }


def detect_recurring(
    db: Session, month: Optional[str] = None, lookback: int = 6
) -> Dict:
    with _Timed("recurring"):
        lookback = max(1, min(24, int(lookback or 6)))
        _, by_month = _monthly_sums(db, lookback, month)
    all_txns: List[Dict] = []
    for arr in by_month.values():
        all_txns.extend(arr)
    groups: Dict[str, List[Dict]] = defaultdict(list)
    for t in all_txns:
        if t["amount"] < 0:
            groups[t["merchant"]].append(t)

    results = []
    for merch, arr in groups.items():
        arr = sorted(arr, key=lambda x: x["date"])
        if len(arr) < 3:
            continue
        dom = Counter(
            [
                getattr(d["date"], "day", None)
                or _dt.fromisoformat(str(d["date"])[:10]).day
                for d in arr
            ]
        )
        gaps = [
            (
                (arr[i]["date"] - arr[i - 1]["date"]).days
                if hasattr(arr[i]["date"], "__sub__")
                else (
                    _dt.fromisoformat(str(arr[i]["date"])[:10])
                    - _dt.fromisoformat(str(arr[i - 1]["date"])[:10])
                ).days
            )
            for i in range(1, len(arr))
        ]
        median_gap = stats.median(gaps) if gaps else None
        monthlyish = median_gap and 25 <= median_gap <= 35
        dom_peak = dom.most_common(1)[0][1] / len(arr)
        strength = (dom_peak + (1 if monthlyish else 0)) / 2
        avg_amt = sum(abs(x["amount"]) for x in arr) / len(arr)
        results.append(
            {
                "merchant": merch,
                "count": len(arr),
                "avg_amount": round(avg_amt, 2),
                "median_gap_days": median_gap,
                "strength": round(strength, 2),
            }
        )
    # Sort by composite numeric tuple; mypy expects a key returning an orderable type
    results.sort(
        key=lambda x: (float(x["strength"]), int(x["count"]), float(x["avg_amount"])),
        reverse=True,
    )
    return {"items": results[:50]}


SUB_KEYWORDS = [
    "spotify",
    "netflix",
    "hulu",
    "prime",
    "apple",
    "google",
    "microsoft",
    "adobe",
    "discord",
    "crunchyroll",
    "patreon",
    "xbox",
    "playstation",
    "gym",
    "planet fitness",
    "new york times",
    "washington post",
    "substack",
    "dropbox",
    "1password",
    "notion",
    "zoom",
    "slack",
    "figma",
]


def find_subscriptions(
    db: Session, month: Optional[str] = None, lookback: int = 6
) -> Dict:
    with _Timed("subscriptions"):
        lookback = max(1, min(24, int(lookback or 6)))
        rec = detect_recurring(db, month, lookback)["items"]
    out = []
    for r in rec:
        name = (r["merchant"] or "").lower()
        kw = any(k in name for k in SUB_KEYWORDS)
        monthlyish = (
            r.get("median_gap_days") and 25 <= (r.get("median_gap_days") or 0) <= 35
        )
        if (kw and r["strength"] >= 0.5) or (monthlyish and r["strength"] >= 0.7):
            out.append({**r, "tag": "keyword" if kw else "cadence"})
    return {"items": out}


def build_recurring_response(
    db: Session, month: Optional[str] = None, lookback: int = 6
) -> Dict:
    """
    Mode: 'recurring' — broad recurring patterns.
    Returns both subscription-like AND other recurring charges.
    """
    with _Timed("recurring_response"):
        lookback = max(1, min(24, int(lookback or 6)))
        rec = detect_recurring(db, month, lookback)["items"]

    subscriptions = []
    other_recurring = []

    for r in rec:
        name = (r["merchant"] or "").lower()
        kw = any(k in name for k in SUB_KEYWORDS)
        monthlyish = (
            r.get("median_gap_days") and 25 <= (r.get("median_gap_days") or 0) <= 35
        )

        # Classify as subscription or other recurring
        is_subscription = (kw and r["strength"] >= 0.5) or (
            monthlyish and r["strength"] >= 0.7
        )

        item = {
            "merchant": r["merchant"],
            "count": r["count"],
            "avg_amount": r["avg_amount"],
            "median_gap_days": r["median_gap_days"],
            "strength": r["strength"],
            "is_subscription": is_subscription,
            "tag": "keyword" if kw else ("cadence" if monthlyish else "pattern"),
        }

        if is_subscription:
            subscriptions.append(item)
        else:
            other_recurring.append(item)

    return {
        "mode": "recurring",
        "month": month,
        "window_months": lookback,
        "subscriptions": subscriptions,
        "other_recurring": other_recurring,
        "llm_prompt": FINANCE_RECURRING_PROMPT,
    }


def build_subscriptions_response(
    db: Session, month: Optional[str] = None, lookback: int = 6
) -> Dict:
    """
    Mode: 'subscriptions' — narrower, cancel/downgrade focus.
    Returns only subscription-like charges with cancel candidates flagged.
    """
    with _Timed("subscriptions_response"):
        lookback = max(1, min(24, int(lookback or 6)))
        rec = detect_recurring(db, month, lookback)["items"]

    subscriptions = []
    cancel_candidates = []

    # Simple heuristic for cancel threshold (can be refined)
    CANCEL_THRESHOLD = 10.0  # $10/month minimum to suggest cancellation

    # Essential keywords (utilities, essential services)
    ESSENTIAL_KEYWORDS = [
        "electric",
        "power",
        "utility",
        "water",
        "gas",
        "internet",
        "phone",
        "insurance",
        "rent",
        "mortgage",
        "loan",
    ]

    for r in rec:
        name = (r["merchant"] or "").lower()
        kw = any(k in name for k in SUB_KEYWORDS)
        monthlyish = (
            r.get("median_gap_days") and 25 <= (r.get("median_gap_days") or 0) <= 35
        )

        # Only include subscription-like charges
        if not ((kw and r["strength"] >= 0.5) or (monthlyish and r["strength"] >= 0.7)):
            continue

        # Check if essential
        is_essential = any(ek in name for ek in ESSENTIAL_KEYWORDS)

        # Determine if cancel candidate
        is_cancel_candidate = (
            not is_essential
            and r["avg_amount"] >= CANCEL_THRESHOLD
            and r["strength"] >= 0.7  # High confidence it's recurring
        )

        item = {
            "merchant": r["merchant"],
            "count": r["count"],
            "avg_amount": r["avg_amount"],
            "median_gap_days": r["median_gap_days"],
            "strength": r["strength"],
            "is_subscription": True,
            "is_essential": is_essential,
            "cancel_candidate": is_cancel_candidate,
            "tag": "keyword" if kw else "cadence",
        }

        subscriptions.append(item)
        if is_cancel_candidate:
            cancel_candidates.append(item)

    return {
        "mode": "subscriptions",
        "month": month,
        "window_months": lookback,
        "subscriptions": subscriptions,
        "cancel_candidates": cancel_candidates,
        "llm_prompt": FINANCE_FIND_SUBSCRIPTIONS_PROMPT,
    }


def budget_suggest(db: Session, month: Optional[str] = None, lookback: int = 6) -> Dict:
    with _Timed("budget_suggest"):
        lookback = max(1, min(24, int(lookback or 6)))
        series, by_month = _monthly_sums(db, lookback, month)
    # Aggregate spend per category per month
    spend_per: Dict[str, List[float]] = defaultdict(list)
    for m in sorted(series.keys()):
        txns = by_month.get(m, [])
        cat_spend: Dict[str, float] = defaultdict(float)
        for t in txns:
            if t["amount"] < 0:
                cat = t["category"] or "Unknown"
                cat_spend[cat] += abs(t["amount"])
        for cat, s in cat_spend.items():
            spend_per[cat].append(float(s))

    def pct(xs: List[float], p: float) -> float:
        xs = sorted(xs)
        if not xs:
            return 0.0
        k = (len(xs) - 1) * p
        f = math.floor(k)
        c = math.ceil(k)
        return xs[f] if f == c else xs[f] * (c - k) + xs[c] * (k - f)

    items: List[Dict[str, Any]] = []
    for cat, vals in spend_per.items():
        if not vals:
            continue
        items.append(
            {
                "category": cat,
                "p50": round(pct(vals, 0.5), 2),
                "p75": round(pct(vals, 0.75), 2),
                "p90": round(pct(vals, 0.9), 2),
                "avg": round(sum(vals) / len(vals), 2),
                "months": len(vals),
            }
        )
    items.sort(key=lambda x: float(x["avg"]), reverse=True)
    return {"items": items}


def whatif_sim(db: Session, payload: Dict) -> Dict:
    with _Timed("whatif_sim"):
        month = payload.get("month")
        cuts = payload.get("cuts", []) or []
    if not month:
        return {"ok": False, "reason": "missing_month"}
    # Fetch all txns for the month
    txns = db.query(Transaction).filter(Transaction.month == month).all()
    base_in = base_out = 0.0
    sim_in = sim_out = 0.0
    for t in txns:
        amt = float(t.amount or 0.0)
        if amt >= 0:
            base_in += amt
            sim_in += amt
        else:
            spend = abs(amt)
            cut_pct = 0.0
            for c in cuts:
                cat = c.get("category")
                merch = c.get("merchant")
                pct = float(c.get("pct", 0.0)) / 100.0
                if cat and (t.category or "") == cat:
                    cut_pct = max(cut_pct, pct)
                if (
                    merch
                    and (t.merchant_canonical or t.merchant or "").lower()
                    == str(merch).lower()
                ):
                    cut_pct = max(cut_pct, pct)
            reduced = spend * (1.0 - cut_pct)
            base_out += spend
            sim_out += reduced
    return {
        "month": month,
        "base": {"inflows": base_in, "outflows": base_out, "net": base_in - base_out},
        "sim": {"inflows": sim_in, "outflows": sim_out, "net": sim_in - sim_out},
    }
