"""Schema drift checker for ML Pipeline Phase 2.1.

Verifies that all required tables and columns exist for the ML pipeline to function.
Run with: python -m app.drift_check
"""

from __future__ import annotations
import json
import sqlalchemy as sa
from sqlalchemy import inspect
from app.config import settings

ENGINE = sa.create_engine(settings.DATABASE_URL)

# Desired minimal surface we need for Phase 2.1 to run
WANT = {
    "transactions": ["id", "date", "merchant", "description", "amount", "month"],
    # labels (choose whatever exists)
    # either user_labels(txn_id, category) or transaction_labels(txn_id, label)
    "user_labels": ["id", "txn_id", "category"],
    "transaction_labels": ["id", "txn_id", "label"],
    "suggestions": [
        "id",
        "txn_id",
        "label",
        "confidence",
        "reason_json",
        "accepted",
        "model_version",
        "source",
        "timestamp",
    ],
    # optional, may be absent:
    "feedback": [
        "id",
        "txn_id",
        "decision",
        "source",
        "created_at",
        "merchant",
    ],  # 'merchant' optional; we add if missing
}


def exists(table, cols, insp):
    if table not in insp.get_table_names():
        return False, []
    got = [c["name"] for c in insp.get_columns(table)]
    missing = [c for c in cols if c not in got]
    return len(missing) == 0, missing


def main():
    with ENGINE.connect() as conn:
        insp = inspect(conn)
        report = {}
        for t, cols in WANT.items():
            ok, missing = exists(t, cols, insp)
            report[t] = {
                "present": ok and t in insp.get_table_names(),
                "missing_cols": missing,
            }
        # determine which label table to use
        label_table = (
            "user_labels"
            if report["user_labels"]["present"]
            else (
                "transaction_labels"
                if report["transaction_labels"]["present"]
                else None
            )
        )
        report["label_source"] = label_table
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
