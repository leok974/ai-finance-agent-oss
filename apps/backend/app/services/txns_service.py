from __future__ import annotations
from typing import Optional
from sqlalchemy.orm import Session

from app.services.rules_apply import latest_month_from_data, apply_all_active_rules


def reclassify_transactions(db: Session, month: Optional[str] = None) -> int:
    m = month or latest_month_from_data(db)
    if not m:
        return 0
    applied, _skipped, _details = apply_all_active_rules(db, m)
    return int(applied)
