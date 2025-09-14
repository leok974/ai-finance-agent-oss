from app.transactions import Transaction


def seed(db):
    from datetime import date
    rows = []
    for i,(y,m,inc,spend) in enumerate([
        (2025,1,2000,300),(2025,2,2100,320),(2025,3,2200,330),(2025,4,2300,340)
    ]):
        rows.append(Transaction(date=date(y,m,5), amount=inc, merchant="ACME", category="Salary", month=f"{y:04d}-{m:02d}"))
        rows.append(Transaction(date=date(y,m,7), amount=-spend, merchant="Grocer", category="Groceries", month=f"{y:04d}-{m:02d}"))
    db.add_all(rows)
    db.commit()


def test_forecast(client, db_session):
    seed(db_session)
    r = client.post("/agent/tools/analytics/forecast/cashflow", json={"horizon": 2})
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j.get("forecast"), list)
    assert len(j["forecast"]) == 2
