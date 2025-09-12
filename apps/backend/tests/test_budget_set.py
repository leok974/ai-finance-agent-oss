from app.routers.budget import set_budget, BudgetSetReq
from app.orm_models import Budget


def test_set_budget_upsert(db_session):
    # create
    resp = set_budget(BudgetSetReq(category="Groceries", amount=500), db_session)
    assert resp["ok"] is True
    assert resp["budget"]["category"] == "Groceries"
    assert resp["budget"]["amount"] == 500.0

    # update
    resp2 = set_budget(BudgetSetReq(category="Groceries", amount=450.25), db_session)
    assert abs(resp2["budget"]["amount"] - 450.25) < 1e-6

    row = db_session.query(Budget).filter(Budget.category == "Groceries").one()
    assert abs(float(row.amount) - 450.25) < 1e-6
