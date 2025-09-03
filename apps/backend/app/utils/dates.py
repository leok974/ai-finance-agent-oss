# apps/backend/app/utils/dates.py
from typing import Optional

def latest_month_from_txns(txns) -> Optional[str]:
    """
    Given a list of transactions with "date" fields (YYYY-MM-DD),
    return the most recent YYYY-MM string, or None if no valid txns.
    """
    months = sorted({ str(t.get("date", ""))[:7] for t in txns if t.get("date") })
    return months[-1] if months else None
