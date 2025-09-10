from datetime import date
from app.orm_models import Transaction
from app.services.insights_anomalies import compute_anomalies


def seed_fixture(db):
    # 5 prior months Groceries: ~400 median; current spikes to 700
    dates = [(2025,4),(2025,5),(2025,6),(2025,7),(2025,8)]
    for (y,m), amt in zip(dates, [-380,-420,-400,-410,-390]):
        db.add(Transaction(date=date(y,m,5), category="Groceries", amount=amt))
    # current (assume 2025-09 is max month in test DB)
    db.add(Transaction(date=date(2025,9,6), category="Groceries", amount=-700))
    # Low sample / income / unknown ignored
    db.add(Transaction(date=date(2025,9,10), category="Salary", amount=3000))
    db.add(Transaction(date=date(2025,9,11), category="Unknown", amount=-80))
    db.commit()


def test_anomalies_basic(db_session):
    seed_fixture(db_session)
    res = compute_anomalies(db_session, months=6, min_spend_current=50.0, threshold_pct=0.4)
    anns = res["anomalies"]
    assert any(a["category"] == "Groceries" and a["direction"] == "high" for a in anns)
