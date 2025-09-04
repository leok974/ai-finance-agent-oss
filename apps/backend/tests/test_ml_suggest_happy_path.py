import io
import textwrap
import pytest
pytestmark = pytest.mark.skip(reason="Legacy /ml/* endpoints removed; use /agent/tools/*")
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _ingest(csv_text: str):
    files = {"file": ("seed.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest", files=files)
    assert r.status_code in (200, 201), r.text


@pytest.mark.order(1)
def test_ml_suggest_happy_path_and_status_classes():
    # 1) Seed labeled rows for training (no 'Unknown')
    labeled_csv = textwrap.dedent("""\
        date,month,merchant,description,amount,category
        2025-08-10,2025-08,Costco,Groceries run,-85.40,Groceries
        2025-08-12,2025-08,Starbucks,Latte,-5.25,Shopping
        2025-08-13,2025-08,Uber,Ride home,-17.80,Transport
        2025-08-14,2025-08,Spotify,Family plan,-15.99,Subscriptions
        2025-08-15,2025-08,Delta,Flight,-250.00,Travel
    """)
    _ingest(labeled_csv)

    # 2) Train model (small params for speed)
    r = client.post("/ml/train", json={"min_samples": 1, "test_size": 0.2})
    assert r.status_code == 200, r.text

    # 3) Check model status
    r = client.get("/ml/status")
    assert r.status_code == 200, r.text
    status = r.json()
    classes = status.get("classes") or []
    assert classes, f"Expected at least one class, got {classes}"
    assert "Unknown" not in classes, f"'Unknown' leaked into classes: {classes}"

    # 4) Seed unlabeled rows to get suggestions
    # Use near-duplicates of trained merchants/descriptions so model can score them
    unlabeled_csv = textwrap.dedent("""\
        date,month,merchant,description,amount,category
        2025-08-16,2025-08,Starbucks,Latte,-4.95,
        2025-08-17,2025-08,Uber,Ride to office,-19.80,
        2025-08-18,2025-08,Costco,Groceries run,-92.10,
    """)
    _ingest(unlabeled_csv)

    # 5) Call /ml/suggest
    month = "2025-08"
    r = client.get(f"/ml/suggest?month={month}&limit=10&topk=3")
    assert r.status_code == 200, r.text
    payload = r.json()

    # Top-level contract
    assert isinstance(payload, dict)
    assert "month" in payload and "suggestions" in payload, f"Bad shape: {payload}"
    assert payload["month"] == month
    assert isinstance(payload["suggestions"], list)
    assert payload["suggestions"], "Expected at least one suggestion item"

    # Per-item checks
    def labels_from_item(item):
        cands = item.get("candidates") or item.get("topk") or []
        out = []
        for c in cands:
            out.append(c.get("label") or c.get("category"))
        return [x for x in out if x]

    for item in payload["suggestions"]:
        assert "txn_id" in item
        labels = labels_from_item(item)
        assert labels, f"No candidates in suggestion item: {item}"
        assert all(l != "Unknown" for l in labels), f"Found 'Unknown' in candidates: {labels}"
