def test_meta_version(client):
    r = client.get("/agent/tools/meta/version")
    if r.status_code == 405:
        r = client.post("/agent/tools/meta/version")
    assert r.status_code == 200, r.text
    if r.headers.get("content-type", "").startswith("application/json"):
        body = r.json()
        assert any(k in body for k in ("branch", "commit", "version", "tag"))
    else:
        assert r.text != ""


def test_meta_latest_month_post(client):
    r = client.post("/agent/tools/meta/latest_month", json={})
    assert r.status_code in (200, 204), r.text
    if r.status_code == 200:
        body = r.json()
        assert "month" in body
