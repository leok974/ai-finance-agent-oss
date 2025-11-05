"""Quick financial recap summarizer for conversational agent."""

from datetime import datetime
from sqlalchemy.orm import Session
from app.orm_models import Transaction


def _month_bounds(dt: datetime):
    """Get start and end datetime for the month containing dt."""
    start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def human_recap(db: Session, now: datetime) -> dict:
    """Generate a human-friendly financial recap for the current month.
    
    Args:
        db: Database session
        now: Current datetime
        
    Returns:
        Dictionary with income, spend, unknown transactions, top merchant, and MoM comparison
    """
    start, end = _month_bounds(now)

    # Debug: Check if Transaction has the right attributes
    import sys
    print(f"DEBUG: Transaction class: {Transaction}", file=sys.stderr)
    print(f"DEBUG: Transaction attributes: {dir(Transaction)}", file=sys.stderr)
    
    q = db.query(Transaction).filter(
        Transaction.date >= start.date(),
        Transaction.date < end.date()
    )

    txns = q.all()
    income = sum(t.amount for t in txns if t.amount > 0)
    spend = -sum(t.amount for t in txns if t.amount < 0)

    # Unknown/uncategorized transactions
    unknown_txns = [
        t for t in txns 
        if (t.category or "").lower() in ("", "unknown", "uncategorized")
    ]
    unknown_total = -sum(t.amount for t in unknown_txns if t.amount < 0)

    # Top merchant by absolute spend
    spend_by_merchant = {}
    for t in txns:
        if t.amount < 0:
            key = t.merchant or t.description or "Unknown"
            spend_by_merchant[key] = spend_by_merchant.get(key, 0) + (-t.amount)
    
    top_merchant = None
    if spend_by_merchant:
        top_merchant = max(spend_by_merchant.items(), key=lambda kv: kv[1])

    # Month-over-month comparison (previous month totals)
    if start.month > 1:
        prev_start = start.replace(month=start.month - 1)
    else:
        prev_start = start.replace(year=start.year - 1, month=12)
    prev_start = prev_start.replace(day=1)
    prev_end = start
    
    prev_q = db.query(Transaction).filter(
        Transaction.date >= prev_start.date(),
        Transaction.date < prev_end.date()
    )
    prev_txns = prev_q.all()
    prev_income = sum(t.amount for t in prev_txns if t.amount > 0)
    prev_spend = -sum(t.amount for t in prev_txns if t.amount < 0)

    return {
        "month": start.strftime("%Y-%m"),
        "income": round(income, 2),
        "spend": round(spend, 2),
        "unknown_total": round(unknown_total, 2),
        "unknown_count": len(unknown_txns),
        "top_merchant": {
            "name": top_merchant[0], 
            "spend": round(top_merchant[1], 2)
        } if top_merchant else None,
        "prev_income": round(prev_income, 2),
        "prev_spend": round(prev_spend, 2),
    }


def to_conversational_text(summary: dict) -> str:
    """Convert summary dict to friendly conversational text.
    
    Args:
        summary: Dictionary from human_recap()
        
    Returns:
        Human-friendly text summary
    """
    month = summary["month"]
    income = summary["income"]
    spend = summary["spend"]
    net = round(income - spend, 2)
    
    parts = [
        f"Here's your {month} quick recap:\n",
        f"• Income: ${income:,.2f}",
        f"• Spend: ${spend:,.2f}",
        f"• Net: ${net:,.2f}"
    ]

    if summary["top_merchant"]:
        tm = summary["top_merchant"]
        parts.append(f"• Top merchant: {tm['name']} (${tm['spend']:,.2f})")

    if summary["unknown_count"] > 0:
        parts.append(
            f"• Unknown spend: ${summary['unknown_total']:,.2f} across "
            f"{summary['unknown_count']} txn(s) — want me to suggest categories?"
        )

    # Month-over-month hint
    if summary["prev_income"] or summary["prev_spend"]:
        delta_spend = round(spend - summary["prev_spend"], 2)
        if delta_spend > 0:
            hint = "up"
        elif delta_spend < 0:
            hint = "down"
        else:
            hint = "flat"
        parts.append(
            f"• Compared to last month, spend is {hint} by ${abs(delta_spend):,.2f}."
        )
    
    parts.append(
        "\nWant me to dive into subscriptions, unusual spikes, "
        "or set a quick budget rule for next month?"
    )
    
    return "\n".join(parts)
