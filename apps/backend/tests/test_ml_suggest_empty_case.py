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
def test_ml_suggest_returns_empty_list_when_no_unlabeled():
    # Seed only labeled rows for a month; no unlabeled entries are ingested.
    labeled_csv = textwrap.dedent("""\
        date,month,merchant,description,amount,category
        2025-08-10,2025-08,Costco,Groceries run,-85.40,Groceries
        2025-08-12,2025-08,Starbucks,Latte,-5.25,Shopping
        2025-08-13,2025-08,Uber,Ride home,-17.80,Transport
    """)
    _ingest(labeled_csv)

    # 2) Train the model (optional) — only if route exists
    try:
        spec = client.get("/openapi.json")
        if spec.status_code == 200 and any(
            p for p in (spec.json() or {}).get("paths", {}) if p == "/ml/train"
        ):
            r = client.post("/ml/train", json={"min_samples": 1, "test_size": 0.2})
            assert r.status_code == 200, r.text
    except Exception:
        # If openapi or /ml/train is unavailable, continue without training.
        pass

    # Call /ml/suggest for that month — since there are no unlabeled txns, it should return an empty list
    # Use a month with no transactions to guarantee there are no unlabeled rows
    month = "2099-01"
    r = client.get(f"/ml/suggest?month={month}&limit=10&topk=3")
    assert r.status_code == 200, r.text
    payload = r.json()

    # Top-level contract: always an object with 'month' and 'suggestions'
    assert isinstance(payload, dict), f"Expected object, got: {type(payload)}"
    assert "month" in payload and "suggestions" in payload, f"Bad shape: {payload}"
    assert payload["month"] == month
    assert isinstance(payload["suggestions"], list)
    assert payload["suggestions"] == [], f"Expected empty suggestions, got: {payload['suggestions']}"
