def test_chart_category_endpoint(client, db_session):
    from datetime import date
    from app.orm_models import Transaction

    db_session.add(
        Transaction(date=date(2025, 8, 3), category="Groceries", amount=-100)
    )
    db_session.add(
        Transaction(date=date(2025, 9, 3), category="Groceries", amount=-120)
    )
    db_session.commit()
    r = client.get("/charts/category?category=Groceries&months=2").json()
    assert r["category"] == "Groceries"
    assert len(r["series"]) >= 1
