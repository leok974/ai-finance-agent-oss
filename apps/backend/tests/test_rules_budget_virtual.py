from app.services.rules_budget import list_budget_rules
from app.orm_models import Budget

def test_budget_rules_list_merge(db_session):
    db_session.add(Budget(category="Groceries", amount=450.0))
    db_session.add(Budget(category="Transport", amount=160.0))
    db_session.commit()

    rules = list_budget_rules(db_session)
    ids = {r["id"] for r in rules}
    assert "budget:Groceries" in ids and "budget:Transport" in ids
    g = next(r for r in rules if r["id"] == "budget:Groceries")
    assert g["kind"] == "budget"
    assert "Cap Groceries at $450.00" in g["description"]
