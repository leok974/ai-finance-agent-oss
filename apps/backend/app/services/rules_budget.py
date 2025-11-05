# Map Budget rows to rule-like dicts for the Rules list UI.
from typing import List, Dict
from sqlalchemy.orm import Session
from app.orm_models import Budget


def list_budget_rules(db: Session) -> List[Dict]:
    rows = db.query(Budget).order_by(Budget.category.asc()).all()
    rules: List[Dict] = []
    for b in rows:
        rules.append(
            {
                "id": f"budget:{b.category}",
                "kind": "budget",
                "name": f"Budget: {b.category}",
                "display_name": f"Budget: {b.category}",  # ensure UI-friendly label
                "description": f"Cap {b.category} at ${float(b.amount or 0.0):.2f} per month.",
                "category": b.category,
                "amount": round(float(b.amount or 0.0), 2),
                "active": True,
                "created_at": (
                    str(getattr(b, "created_at", None))
                    if getattr(b, "created_at", None)
                    else None
                ),
                "updated_at": (
                    str(getattr(b, "updated_at", None))
                    if getattr(b, "updated_at", None)
                    else None
                ),
            }
        )
    return rules
