import io
import textwrap
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _seed_via_ingest():
    """
    Seed labeled data (including 'Unknown') using the /ingest endpoint with a tiny CSV.
    Columns mirror the typical transactions_sample.csv layout seen in this repo.
    """
    csv = textwrap.dedent(
        """\
        date,month,merchant,description,amount,category
        2025-08-15,2025-08,Costco,Groceries run,-120.55,Groceries
        2025-08-15,2025-08,Starbucks,Latte,-6.45,Shopping
        2025-08-15,2025-08,Uber,Ride to office,-18.20,Transport
        2025-08-15,2025-08,Delta,Flight,-250.00,Travel
        2025-08-15,2025-08,Spotify,Family plan,-15.99,Subscriptions
        2025-08-15,2025-08,Mystery,TBD,-12.34,Unknown
        2025-08-15,2025-08,BlankCat,Missing label,-4.56,
        2025-08-15,2025-08,NoneCat,None label,-7.89,
        """
    ).encode("utf-8")

    files = {"file": ("seed.csv", io.BytesIO(csv), "text/csv")}
    resp = client.post("/ingest", files=files)
    assert resp.status_code in (200, 201), resp.text


@pytest.mark.order(1)
def test_train_after_ingest_excludes_unknown():
    # seed rows (valid + Unknown/empty)
    _seed_via_ingest()

    # retrain quickly
    r = client.post("/ml/train", json={"min_samples": 1, "test_size": 0.2})
    assert r.status_code == 200, r.text

    status = client.get("/ml/status").json()
    classes = status.get("classes") or []
    assert "Unknown" not in classes, f"'Unknown' leaked into classes: {classes}"

    # optional sanity: has at least one class
    assert len(classes) >= 1, f"Expected at least one class after training, got {classes}"


@pytest.mark.order(2)
def test_suggest_never_returns_unknown_label():
    r = client.get("/ml/suggest?limit=10&topk=3")
    if r.status_code == 404:
        pytest.skip("/ml/suggest not implemented in this build")

    assert r.status_code == 200, r.text
    data = r.json() or []
    if not data:
        pytest.skip("No suggestions returned; cannot validate candidates")

    def labels_from(item):
        cands = item.get("candidates") or item.get("topk") or []
        out = []
        for c in cands:
            out.append(c.get("label") or c.get("category"))
        return [x for x in out if x]

    for item in data:
        labels = labels_from(item)
        if not labels:
            continue
        assert all(l != "Unknown" for l in labels), f"Found 'Unknown' in suggestions: {labels}"
