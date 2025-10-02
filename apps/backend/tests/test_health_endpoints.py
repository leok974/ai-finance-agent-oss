def test_healthz_and_ready_ok(client):
    r1 = client.get("/healthz")
    r2 = client.get("/ready")
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
