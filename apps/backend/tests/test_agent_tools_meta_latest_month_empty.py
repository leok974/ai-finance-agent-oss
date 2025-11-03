def test_latest_month_empty_db(client):
    # No transactions inserted; endpoint should still 200 with {'month': None}
    r = client.post("/agent/tools/meta/latest_month", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("month") in (None, "")
