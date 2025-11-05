from __future__ import annotations

from datetime import date


def test_preview_counts_windowed(db_session, client):
    from app.models import Transaction

    # Ensure isolation from prior tests using the shared session-scoped engine
    db_session.query(Transaction).delete()
    db_session.commit()

    db_session.add_all(
        [
            Transaction(
                date=date(2025, 8, 1),
                amount=-450.00,
                description="Starbucks Store 123",
                category=None,
                raw_category=None,
                account="t",
                month="2025-08",
            ),
            Transaction(
                date=date(2025, 8, 5),
                amount=-325.01,
                description="Starbucks Downtown",
                category="Unknown",
                raw_category=None,
                account="t",
                month="2025-08",
            ),
            Transaction(
                date=date(2025, 6, 1),
                amount=-500.00,
                description="STARBUCKS KIOSK",
                category="Groceries",
                raw_category=None,
                account="t",
                month="2025-06",
            ),
        ]
    )
    db_session.commit()

    payload = {"pattern": "starbucks", "target": "description", "category": "Coffee"}
    r = client.post(
        "/rules/preview?window_days=60&only_uncategorized=true", json=payload
    )
    assert r.status_code == 200
    data = r.json()
    assert data["matches_count"] == 2  # within 60-day window and uncategorized-only
    assert len(data["sample_txns"]) >= 1


essential_backfill_shape = {
    "when": {"target": "description", "pattern": "starbucks"},
    "then": {"category": "Coffee"},
}


def test_backfill_dry_run(db_session, client):
    from app.models import Transaction, Rule

    # Ensure isolation from prior tests
    db_session.query(Transaction).delete()
    db_session.commit()

    db_session.add_all(
        [
            Transaction(
                date=date(2025, 8, 1),
                amount=-451.23,
                description="Starbucks Store 123",
                category=None,
                raw_category=None,
                account="t",
                month="2025-08",
            ),
            Transaction(
                date=date(2025, 8, 5),
                amount=-326.02,
                description="Starbucks Downtown",
                category="Unknown",
                raw_category=None,
                account="t",
                month="2025-08",
            ),
        ]
    )
    db_session.commit()

    # Minimal rule compatible with current ORM: pattern/target/category
    rule = Rule(
        pattern="starbucks", target="description", category="Coffee", active=True
    )
    db_session.add(rule)
    db_session.commit()

    r = client.post(
        f"/rules/{rule.id}/backfill?dry_run=true&only_uncategorized=true", json={}
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] and data["dry_run"] and data["matched"] >= 1
