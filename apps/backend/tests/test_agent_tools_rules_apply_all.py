import pytest
import datetime as dt

pytestmark = pytest.mark.agent_tools

# Reuse the Session factory from conftest via its exposed fixture
@pytest.fixture
def db_session(_SessionLocal):
    s = _SessionLocal()
    try:
        yield s
    finally:
        s.close()

def test_apply_all_active_rules_flow(client, db_session):
    from app.orm_models import Transaction, Rule

    # Seed a couple of unlabeled txns for a month
    t1 = Transaction(date=dt.date(2025, 8, 3), month="2025-08",
                     merchant="Starbucks", description="Latte",
                     amount=-5.25, category=None)
    t2 = Transaction(date=dt.date(2025, 8, 5), month="2025-08",
                     merchant="STARBUCKS #1234", description="Iced coffee",
                     amount=-4.10, category="")  # unlabeled
    t3 = Transaction(date=dt.date(2025, 8, 8), month="2025-08",
                     merchant="Grocery Mart", description="food",
                     amount=-30.00, category="Groceries")  # already labeled
    db_session.add_all([t1, t2, t3])
    db_session.commit()

    # One active rule for Starbucks -> Dining out
    r = Rule(merchant="Starbucks", category="Dining out", active=True)
    db_session.add(r)
    db_session.commit()

    # Call endpoint without month -> should resolve to 2025-08
    res = client.post("/agent/tools/rules/apply_all", json={}).json()
    assert res["month"] == "2025-08"
    # There may be pre-seeded unlabeled txns in this test DB; ensure our two got applied
    assert res["applied"] >= 2
    assert res["skipped"] >= 0
    ids = {d["id"] for d in res["details"]}
    assert t1.id in ids and t2.id in ids

    # Verify persisted
    t1_ref = db_session.get(Transaction, t1.id)
    t2_ref = db_session.get(Transaction, t2.id)
    assert t1_ref.category == "Dining out"
    assert t2_ref.category == "Dining out"
    # And ensure already-labeled txn remained unchanged
    t3_ref = db_session.get(Transaction, t3.id)
    assert t3_ref.category == "Groceries"
