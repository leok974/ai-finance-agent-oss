# apps/backend/app/utils/dates.py
from typing import Optional
import datetime as dt


def latest_month_from_txns(txns) -> Optional[str]:
    """
    Given a list of transactions with "date" fields (YYYY-MM-DD),
    return the most recent YYYY-MM string, or None if no valid txns.
    """
    months = set()
    for t in txns:
        date_str = str(t.get("date", ""))
        if date_str:
            try:
                # Parse date string and use strftime for consistent formatting
                date_obj = dt.date.fromisoformat(date_str[:10])
                months.add(date_obj.strftime("%Y-%m"))
            except (ValueError, TypeError):
                # Fallback to string slicing for malformed dates
                if len(date_str) >= 7:
                    months.add(date_str[:7])

    return max(months) if months else None
