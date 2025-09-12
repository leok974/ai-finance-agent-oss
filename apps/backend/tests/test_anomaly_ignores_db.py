def test_anomaly_ignores_db(client, db_session):
    r0 = client.get("/insights/anomalies/ignore").json()
    assert "ignored" in r0
    r1 = client.post("/insights/anomalies/ignore/Groceries").json()
    assert "Groceries" in r1["ignored"]
    r2 = client.delete("/insights/anomalies/ignore/Groceries").json()
    assert "Groceries" not in r2["ignored"]
