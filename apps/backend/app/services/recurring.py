from collections import defaultdict
from datetime import date, timedelta
from typing import List
from sqlalchemy.orm import Session
from app.transactions import Transaction
from app.orm_models import RecurringSeries


def _infer_cadence(sorted_dates: List[date]) -> str:
    if len(sorted_dates) < 3:
        return "unknown"
    # crude distance histogram in days
    diffs = [
        (sorted_dates[i] - sorted_dates[i - 1]).days
        for i in range(1, len(sorted_dates))
    ]
    avg = sum(diffs) / len(diffs)
    if 26 <= avg <= 35:  # monthly-ish
        return "monthly"
    if 6 <= avg <= 8:  # weekly-ish
        return "weekly"
    if 350 <= avg <= 380:
        return "yearly"
    return "unknown"


def scan_recurring(db: Session, month: str | None = None) -> int:
    """
    Group by merchant; pick near-constant amounts; write/update RecurringSeries.
    Returns number of series upserted.
    """
    q = db.query(Transaction).filter(Transaction.merchant.isnot(None))
    if month:
        q = q.filter(Transaction.month == month)
    txns = q.all()
    by_merchant = defaultdict(list)
    for t in txns:
        if t.category and t.category.lower() in ("transfer", "internal"):
            continue
        by_merchant[t.merchant.strip()].append(t)

    upserts = 0
    for m, rows in by_merchant.items():
        # cluster amounts within small variance (e.g., ±5%)
        amounts = [
            float(abs(r.amount)) for r in rows
        ]  # subs are usually charges (negative), use abs
        if not amounts:
            continue
        avg_amt = sum(amounts) / len(amounts)
        # accept only if stdev small relative to mean (quick proxy)
        variance = sum((a - avg_amt) ** 2 for a in amounts) / len(amounts)
        stdev = variance**0.5
        if avg_amt <= 0:
            continue
        if stdev / avg_amt > 0.15:  # >15% variation -> weak candidate
            continue

        dates = sorted([r.date for r in rows if r.date is not None])
        if not dates:
            continue

        cadence = _infer_cadence(dates)
        first_seen, last_seen = dates[0], dates[-1]
        next_due = None
        if cadence == "monthly":
            # naive: last_seen + 30 days
            next_due = last_seen + timedelta(days=30)
        elif cadence == "weekly":
            next_due = last_seen + timedelta(days=7)
        elif cadence == "yearly":
            next_due = last_seen + timedelta(days=365)

        existing = (
            db.query(RecurringSeries).filter(RecurringSeries.merchant == m).first()
        )
        sample_txn_id = rows[-1].id if rows else None
        if existing:
            existing.avg_amount = round(avg_amt, 2)
            existing.cadence = cadence
            existing.first_seen = min(existing.first_seen, first_seen)
            existing.last_seen = max(existing.last_seen, last_seen)
            existing.next_due = next_due
            existing.sample_txn_id = sample_txn_id
        else:
            s = RecurringSeries(
                merchant=m,
                avg_amount=round(avg_amt, 2),
                cadence=cadence,
                first_seen=first_seen,
                last_seen=last_seen,
                next_due=next_due,
                sample_txn_id=sample_txn_id,
            )
            db.add(s)
        upserts += 1

    db.commit()
    return upserts
