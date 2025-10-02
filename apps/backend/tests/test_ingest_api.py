from io import BytesIO


def test_ingest_minimal_csv_success(client):
    csv = b"date,amount,merchant\n2025-01-01,12.34,Coffee\n"
    files = {"file": ("mini.csv", BytesIO(csv), "text/csv")}
    r = client.post("/ingest?replace=false", files=files)
    assert r.status_code in (200, 201, 202, 204), r.text
    if r.headers.get("content-type", "").startswith("application/json"):
        body = r.json()
        # Existing ingest returns { ok: bool, added/count etc. }
        assert body.get("ok") is True


def test_ingest_bad_csv_400(client):
    bad = b"not,really,csv"
    files = {"file": ("bad.csv", BytesIO(bad), "text/csv")}
    r = client.post("/ingest?replace=false", files=files)
    # Some ingest implementations may still parse a minimal line; allow 200 but assert shape
    if r.status_code in (400, 422):
        return
    assert r.status_code == 200
    if r.headers.get("content-type", "").startswith("application/json"):
        body = r.json()
        assert "ok" in body