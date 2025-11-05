from app.services.rules_budget import list_budget_rules
from app.orm_models import Budget


def test_budget_rules_list_merge(db_session):
    # Upsert to avoid unique collisions across test order
    for cat, amt in [("Groceries", 450.0), ("Transport", 160.0)]:
        obj = db_session.query(Budget).filter(Budget.category == cat).one_or_none()
        if obj:
            obj.amount = amt
        else:
            db_session.add(Budget(category=cat, amount=amt))
    db_session.commit()

    rules = list_budget_rules(db_session)
    ids = {r["id"] for r in rules}
    assert "budget:Groceries" in ids and "budget:Transport" in ids
    g = next(r for r in rules if r["id"] == "budget:Groceries")
    assert g["kind"] == "budget"
    assert "Cap Groceries at $450.00" in g["description"]
