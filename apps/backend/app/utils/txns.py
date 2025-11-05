from typing import Any, Dict


def txn_to_dict(t) -> Dict[str, Any]:
    """Normalize a Transaction ORM row to a dict with ISO date string.

    Safe to call with any object that has attributes compatible with our ORM model.
    """
    return {
        "id": getattr(t, "id", None),
        "merchant": getattr(t, "merchant", None),
        "description": getattr(t, "description", None),
        "amount": getattr(t, "amount", None),
        "category": getattr(t, "category", None),
        "raw_category": getattr(t, "raw_category", None),
        "account": getattr(t, "account", None),
        "month": getattr(t, "month", None),
        "date": (
            getattr(t, "date", None).isoformat() if getattr(t, "date", None) else None
        ),
        "created_at": getattr(t, "created_at", None),
        "updated_at": getattr(t, "updated_at", None),
    }
