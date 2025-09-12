def test_ignore_category_affects_anomalies(client, db_session):
    # seed a simple spike so category appears
    from datetime import date
    from app.orm_models import Transaction
    for (y,m), amt in [((2025,5),-200),((2025,6),-210),((2025,7),-190),((2025,8),-205)]:
        db_session.add(Transaction(date=date(y,m,5), category="Transport", amount=amt))
    db_session.add(Transaction(date=date(2025,9,6), category="Transport", amount=-500))
    db_session.commit()

    # appears before ignore
    a1 = client.get("/insights/anomalies?months=6&threshold_pct=0.3").json()
    assert any(x["category"] == "Transport" for x in a1["anomalies"])

    # ignore then it should disappear
    client.post("/insights/anomalies/ignore/Transport")
    a2 = client.get("/insights/anomalies?months=6&threshold_pct=0.3").json()
    assert all(x["category"] != "Transport" for x in a2["anomalies"])
