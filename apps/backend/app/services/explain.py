from datetime import datetime
from typing import TypedDict, Tuple, Dict, Any, List, NotRequired
from sqlalchemy.orm import Session
from sqlalchemy import text, func, case
from app.models import Transaction
from app.services.rag_client import explain_with_rag
from app.metrics_ml import lm_help_rag_total


class Explain(TypedDict):
    title: str
    what: str
    why: str
    actions: list[str]
    reasons: NotRequired[List[str]]  # Metadata: ["rag", "llm", "heuristic"]
    grounded: NotRequired[bool]  # True if RAG/LLM was used, False if heuristic only


def _rag_metadata(rag_result: str | None) -> tuple[list[str], bool]:
    """
    Generate metadata for RAG/heuristic explainer results.
    
    Returns:
        (reasons, grounded) tuple:
        - reasons: ["rag"] if RAG succeeded, ["heuristic"] otherwise
        - grounded: True if RAG succeeded, False otherwise
    """
    if rag_result:
        return (["rag"], True)
    else:
        return (["heuristic"], False)


def _month_bounds(yyyymm: str):
    """
    Convert YYYY-MM to (start, end) datetimes.
    
    Raises:
        ValueError: If month is not in 1-12 range
    """
    year, month = map(int, yyyymm.split("-"))
    
    # Validate month range
    if not (1 <= month <= 12):
        raise ValueError(f"Month must be between 1 and 12, got {month}")
    
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)
    return start, end


def _top_merchants(db: Session, yyyymm: str, limit: int = 7):
    """Query top spending merchants for the month."""
    start, end = _month_bounds(yyyymm)
    
    query = text("""
        SELECT merchant, SUM(amount) as total
        FROM transactions
        WHERE date >= :start AND date < :end AND amount < 0
        GROUP BY merchant
        ORDER BY total ASC
        LIMIT :limit
    """)
    
    result = db.execute(query, {"start": start, "end": end, "limit": limit})
    return [(row.merchant, abs(row.total)) for row in result]


def _daily_spikes(db: Session, yyyymm: str, top_n: int = 3):
    """Find largest daily outflow spikes."""
    start, end = _month_bounds(yyyymm)
    
    query = text("""
        SELECT date, SUM(amount) as daily_total
        FROM transactions
        WHERE date >= :start AND date < :end AND amount < 0
        GROUP BY date
        ORDER BY daily_total ASC
        LIMIT :top_n
    """)
    
    result = db.execute(query, {"start": start, "end": end, "top_n": top_n})
    return [(row.date, abs(row.daily_total)) for row in result]


def explain_month_merchants(db: Session, yyyymm: str) -> Explain:
    """Generate contextual explanation for charts.month_merchants panel."""
    merchants = _top_merchants(db, yyyymm, limit=7)
    spikes = _daily_spikes(db, yyyymm, top_n=3)
    
    # Build "what" summary
    if merchants:
        top_3 = ", ".join([m[0] for m in merchants[:3]])
        total_spend = sum(m[1] for m in merchants)
        top3_share = sum(m[1] for m in merchants[:3]) / total_spend if total_spend > 0 else 0
        what = f"Top merchant: {merchants[0][0]} (${merchants[0][1]:.0f}); Top 3 share: {top3_share:.0%} of plotted spend"
    else:
        what = "No significant spending recorded"
    
    # Build context for RAG
    context_bullets = [
        what,
        f"Month={yyyymm}",
        f"Merchants={', '.join(m[0] for m in merchants[:5])}",
    ]
    if spikes:
        spike_dates = ", ".join([s[0].strftime("%Y-%m-%d") for s in spikes])
        context_bullets.append(f"Largest daily outflows on: {spike_dates}")
    
    # Try RAG first
    query = f"Why might spending be high for {', '.join(m[0] for m in merchants[:3])} in {yyyymm}?"
    rag_why = explain_with_rag(
        query=query, 
        context_bullets=context_bullets,
        panel_id="charts.month_merchants",
        month=yyyymm
    )
    
    # Generate metadata
    reasons_meta, grounded = _rag_metadata(rag_why)
    
    # Fall back to heuristics if RAG unavailable
    if rag_why:
        why = rag_why
    else:
        # Heuristic analysis
        lm_help_rag_total.labels(status="heuristic").inc()
        merchant_names = [m[0].lower() for m in merchants]
        
        insights = []
        if any(kw in " ".join(merchant_names) for kw in ["utility", "electric", "gas", "water"]):
            insights.append("Utilities present - recurring monthly bills")
        if any(kw in " ".join(merchant_names) for kw in ["doordash", "uber", "grubhub", "delivery"]):
            insights.append("Food delivery detected - discretionary spending opportunity")
        if any(kw in " ".join(merchant_names) for kw in ["amazon", "walmart", "target"]):
            insights.append("E-commerce/retail - check for impulse purchases")
        if any(kw in " ".join(merchant_names) for kw in ["subscription", "netflix", "spotify", "adobe"]):
            insights.append("Subscriptions detected - review for unused services")
        
        if len(merchants) >= 5 and merchants[0][1] > sum(m[1] for m in merchants) * 0.4:
            insights.append("High concentration in top merchant - single vendor dependency")
        
        why = " • ".join(insights) if insights else "Standard monthly expenses"
    
    # Build actions
    actions = [
        "Review for recurring subscriptions to cancel",
        "Compare with previous month trends",
        "Check for unusual one-time charges",
    ]
    
    if spikes:
        spike_date = spikes[0][0].strftime("%Y-%m-%d")
        actions.insert(0, f"Investigate spike on {spike_date}")
    
    if merchants:
        actions.insert(0, f"Create a rule to auto-categorize {merchants[0][0]} (Unknowns → Promote to rule)")
    
    return {
        "title": f"Top Merchants — {yyyymm}",
        "what": what,
        "why": why,
        "actions": actions,
        "reasons": reasons_meta,
        "grounded": grounded,
    }


def build_explanation(txn, suggestions, applied_rule=None):
    pieces = []
    if applied_rule:
        pieces.append(
            f"Matched rule: /{applied_rule['pattern']}/ on {applied_rule['target']} -> {applied_rule['category']}"
        )
    if suggestions:
        best = suggestions[0]
        pieces.append(
            f"LLM top guess: {best['category']} ({int(best['confidence']*100)}%)"
        )
    return " | ".join(pieces) if pieces else "No signal available."


# ============================================================================
# Additional helper functions for categories and daily flows
# ============================================================================

def _month_range(db: Session, yyyymm: str) -> Tuple[int, float, float]:
    """Return txn count, total_out(abs), total_in for the month."""
    start, end = _month_bounds(yyyymm)
    q = (
        db.query(
            func.count(Transaction.id),
            func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0.0)),
            func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0.0)),
        ).filter(Transaction.date >= start, Transaction.date < end)
    ).first()
    n = int(q[0] or 0)
    out_abs = float(q[1] or 0.0)
    in_sum = float(q[2] or 0.0)
    return n, out_abs, in_sum


def _categories_breakdown(db: Session, yyyymm: str, limit=7):
    """
    Try Transaction.category first; fall back to 'Unknown'.
    Returns list[{category, spend, count}]; spend is absolute outflow.
    """
    start, end = _month_bounds(yyyymm)
    
    # Check if category column exists
    category_col = Transaction.category if hasattr(Transaction, "category") else func.coalesce(None, "Unknown")
    
    rows = (
        db.query(
            category_col.label("category"),
            func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0.0)).label("spend_abs"),
            func.count(Transaction.id).label("count_txn"),
        )
        .filter(Transaction.date >= start, Transaction.date < end)
        .group_by("category")
        .order_by(func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0.0)).desc())
        .limit(limit)
        .all()
    )
    return [
        dict(
            category=(getattr(r, "category", None) or "Unknown"),
            spend=float(getattr(r, "spend_abs", 0.0) or 0.0),
            count=int(getattr(r, "count_txn", 0) or 0)
        )
        for r in rows
    ]


def _daily_in_out_series(db: Session, yyyymm: str, top_n_spikes=3):
    """Get daily inflow/outflow series and identify spike days."""
    start, end = _month_bounds(yyyymm)
    
    # Per-day net, in, out
    rows = (
        db.query(
            func.date(Transaction.date).label("d"),
            func.sum(Transaction.amount).label("net"),
            func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0.0)).label("din"),
            func.sum(case((Transaction.amount < 0, -Transaction.amount), else_=0.0)).label("dout"),
        )
        .filter(Transaction.date >= start, Transaction.date < end)
        .group_by(func.date(Transaction.date))
        .order_by(func.date(Transaction.date))
        .all()
    )
    
    series = [
        dict(
            date=str(r.d),
            net=float(r.net or 0.0),
            inflow=float(r.din or 0.0),
            outflow=float(r.dout or 0.0)
        )
        for r in rows
    ]
    
    # Spikes by outflow
    spikes = sorted(series, key=lambda x: x["outflow"], reverse=True)[:top_n_spikes]
    return series, spikes


def _heuristic_why_categories(cats, total_out):
    """Heuristic insights for category distribution."""
    if not cats or total_out <= 0:
        return "No strong category driver yet; limited or balanced data."
    
    share1 = cats[0]["spend"] / total_out if total_out else 0.0
    share3 = sum(c["spend"] for c in cats[:3]) / total_out if total_out else 0.0
    
    bits = []
    if share1 >= 0.35:
        bits.append(f"Spend is concentrated in {cats[0]['category']} ({share1:.0%}).")
    if share3 >= 0.70:
        bits.append("Top three categories dominate the month.")
    if cats[0]["category"].lower() in {"utilities", "bills", "subscriptions"}:
        bits.append("Recurring bills/subscriptions are likely the main driver.")
    
    return "; ".join(bits) or "Mix of categories with no single dominant driver."


def _heuristic_why_flows(series, spikes):
    """Heuristic insights for daily flow patterns."""
    if not series:
        return "No flow pattern detected yet."
    
    avg_out = sum(p["outflow"] for p in series) / max(len(series), 1)
    max_out = max((p["outflow"] for p in series), default=0.0)
    
    bits = []
    if max_out >= 3 * max(1.0, avg_out):
        bits.append("One or more spike days dominate outflows.")
    if any(p["inflow"] > 0 and p["outflow"] > 0 for p in series):
        bits.append("Mixed in/out on several days suggests transfers or refunds.")
    
    return "; ".join(bits) or "Flows look steady without abnormal spikes."


# ============================================================================
# RAG-aware explainers
# ============================================================================

def explain_month_categories(db: Session, yyyymm: str) -> Dict[str, Any]:
    """Generate contextual explanation for charts.month_categories panel."""
    cats = _categories_breakdown(db, yyyymm, limit=7)
    n_txn, total_out, total_in = _month_range(db, yyyymm)
    
    top = cats[0] if cats else None
    what_bits = [f"Txns={n_txn}, Out=${total_out:.0f}, In=${total_in:.0f}"]
    if top:
        what_bits.append(f"Top category: {top['category']} (${top['spend']:.0f}, {top['count']} txns)")
    if len(cats) > 1:
        share3 = (sum(c["spend"] for c in cats[:3]) / (total_out or 1.0))
        what_bits.append(f"Top 3 share: {share3:.0%} of outflows")
    
    context_bullets = [
        f"Month={yyyymm}",
        *what_bits,
        "Categories=" + ", ".join(f"{c['category']}(${c['spend']:.0f})" for c in cats[:5]),
    ]
    query = f"What likely explains high outflows by category in {yyyymm}?"
    
    # Try RAG first
    rag_why = explain_with_rag(
        query=query, 
        context_bullets=context_bullets,
        panel_id="charts.month_categories",
        month=yyyymm
    )
    
    # Generate metadata and fall back to heuristics if RAG unavailable
    reasons_meta, grounded = _rag_metadata(rag_why)
    if rag_why:
        why = rag_why
    else:
        lm_help_rag_total.labels(status="heuristic").inc()
        why = _heuristic_why_categories(cats, total_out)
    
    actions = []
    if top:
        actions.append(f"Set a budget for {top['category']} and enable alerts.")
    actions.append("Create rules for 'Unknown' merchants to reduce noise.")
    actions.append("Enable ML canary after shadow agreement is healthy.")
    
    return {
        "title": f"Top Categories — {yyyymm}",
        "what": "; ".join(what_bits),
        "why": why,
        "insights": cats,
        "actions": actions,
        "reasons": reasons_meta,
        "grounded": grounded,
    }


def explain_daily_flows(db: Session, yyyymm: str) -> Dict[str, Any]:
    """Generate contextual explanation for charts.daily_flows panel."""
    series, spikes = _daily_in_out_series(db, yyyymm, top_n_spikes=3)
    n_txn, total_out, total_in = _month_range(db, yyyymm)
    
    what_bits = [
        f"Txns={n_txn}, Out=${total_out:.0f}, In=${total_in:.0f}",
    ]
    if spikes:
        what_bits.append("Largest outflow days: " + ", ".join(f"{s['date']} (${s['outflow']:.0f})" for s in spikes))
    
    context_bullets = [
        f"Month={yyyymm}",
        *what_bits,
        "Top spike dates=" + ", ".join(s["date"] for s in spikes),
    ]
    query = f"Why are daily outflows elevated on {', '.join(s['date'] for s in spikes)} in {yyyymm}?"
    
    # Try RAG first
    rag_why = explain_with_rag(
        query=query, 
        context_bullets=context_bullets,
        panel_id="charts.daily_flows",
        month=yyyymm
    )
    
    # Generate metadata and fall back to heuristics if RAG unavailable
    reasons_meta, grounded = _rag_metadata(rag_why)
    if rag_why:
        why = rag_why
    else:
        lm_help_rag_total.labels(status="heuristic").inc()
        why = _heuristic_why_flows(series, spikes)
    
    actions = [
        "Open Daily Flows, hover spike points, and review transactions on those dates.",
        "Create merchant rules for recurring spikes (rent, utilities).",
        "Enable alerts for single-day outflows above your threshold."
    ]
    
    return {
        "title": f"Daily Flows — {yyyymm}",
        "what": "; ".join(what_bits),
        "why": why,
        "insights": {"spikes": spikes, "sample": series[:10]},  # compact preview
        "actions": actions,
        "reasons": reasons_meta,
        "grounded": grounded,
    }


def explain_month_anomalies(db: Session, yyyymm: str) -> Dict[str, Any]:
    """Generate contextual explanation for charts.month_anomalies panel."""
    # Reuse spikes + outlier merchants/categories as "anomalies"
    series, spikes = _daily_in_out_series(db, yyyymm, top_n_spikes=5)
    n_txn, total_out, total_in = _month_range(db, yyyymm)
    
    what_bits = [f"Txns={n_txn}, Out=${total_out:.0f}, In=${total_in:.0f}"]
    if spikes:
        what_bits.append("Top spike days: " + ", ".join(f"{s['date']} (${s['outflow']:.0f})" for s in spikes))
    else:
        what_bits.append("No obvious spikes")
    
    what = "; ".join(what_bits)
    
    context_bullets = [
        f"Month={yyyymm}",
        what,
        "Spike dates=" + ", ".join(s["date"] for s in spikes) if spikes else "No spikes",
    ]
    query = f"Which anomalies likely explain spending in {yyyymm}?"
    
    # Try RAG first
    rag_why = explain_with_rag(
        query=query,
        context_bullets=context_bullets,
        panel_id="charts.month_anomalies",
        month=yyyymm
    )
    
    # Generate metadata and fall back to heuristics
    reasons_meta, grounded = _rag_metadata(rag_why)
    if rag_why:
        why = rag_why
    else:
        lm_help_rag_total.labels(status="heuristic").inc()
        why = "Spike days and unusual net flow explain monthly variance."
    
    actions = [
        "Drill into spike days and verify merchants.",
        "Add rules for recurring spike sources (rent, utilities).",
        "Set alerts for single-day outflows above threshold.",
    ]
    
    return {
        "title": f"Anomalies — {yyyymm}",
        "what": what,
        "why": why,
        "insights": {"spikes": spikes},
        "actions": actions,
        "reasons": reasons_meta,
        "grounded": grounded,
    }


def explain_insights_overview(db: Session, yyyymm: str) -> Dict[str, Any]:
    """Generate contextual explanation for charts.insights_overview panel."""
    cats = _categories_breakdown(db, yyyymm, limit=5)
    merchants = _top_merchants(db, yyyymm, limit=5)
    series, spikes = _daily_in_out_series(db, yyyymm, top_n_spikes=2)
    n_txn, total_out, total_in = _month_range(db, yyyymm)
    
    what_bits = [
        f"Txns={n_txn}, Out=${total_out:.0f}, In=${total_in:.0f}",
    ]
    if cats:
        what_bits.append(f"Top Cat={cats[0]['category']}")
    if merchants:
        what_bits.append(f"Top Merchant={merchants[0][0]}")
    
    what = "; ".join(what_bits)
    
    context_bullets = [
        f"Month={yyyymm}",
        what,
        "Categories=" + ", ".join(c["category"] for c in cats),
        "Merchants=" + ", ".join(m[0] for m in merchants),
        "SpikeDays=" + ", ".join(s["date"] for s in spikes),
    ]
    query = f"Give a concise month overview for {yyyymm} with likely drivers."
    
    # Try RAG first
    rag_why = explain_with_rag(
        query=query,
        context_bullets=context_bullets,
        panel_id="charts.insights_overview",
        month=yyyymm
    )
    
    # Generate metadata and fall back to heuristics
    reasons_meta, grounded = _rag_metadata(rag_why)
    if rag_why:
        why = rag_why
    else:
        lm_help_rag_total.labels(status="heuristic").inc()
        why = "A few categories and merchants dominate spend; review spikes and subscriptions."
    
    actions = [
        "Review Unknowns and promote rules for recurring merchants.",
        "Set per-category budgets and spike alerts.",
        "Enable ML canary after shadow agreement is healthy.",
    ]
    
    return {
        "title": f"Insights — {yyyymm}",
        "what": what,
        "why": why,
        "insights": {
            "categories": cats,
            "merchants": [{"merchant": m[0], "spend": m[1]} for m in merchants],
            "spikes": spikes,
        },
        "actions": actions,
        "reasons": reasons_meta,
        "grounded": grounded,
    }

