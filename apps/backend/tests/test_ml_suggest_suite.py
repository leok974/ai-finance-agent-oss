import io
import textwrap
import pytest
pytestmark = pytest.mark.skip(reason="Legacy /ml/* endpoints removed; use /agent/tools/*")
from fastapi.testclient import TestClient

# Mark entire module as ML-related tests
pytestmark = pytest.mark.skip(reason="Legacy /ml/* endpoints removed; use /agent/tools/*")

from app.main import app

client = TestClient(app)


def _ingest(csv_text: str):
    files = {"file": ("seed.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest", files=files)
    assert r.status_code in (200, 201), r.text


def _maybe_train():
    # Train only if the app exposes /ml/train
    try:
        spec = client.get("/openapi.json")
        if spec.status_code == 200 and "/ml/train" in (spec.json() or {}).get("paths", {}):
            r = client.post("/ml/train", json={"min_samples": 1, "test_size": 0.2})
            assert r.status_code == 200, r.text
    except Exception:
        pass


def _bulk_label(ids: list[int], category: str) -> bool:
    """Prefer bulk route if present; returns True if bulk succeeded."""
    if not ids:
        return True
    try:
        spec = client.get("/openapi.json")
        if spec.status_code == 200 and "/txns/categorize" in (spec.json() or {}).get("paths", {}):
            r = client.post("/txns/categorize", json={"txn_ids": ids, "category": category})
            return r.status_code == 200
    except Exception:
        pass
    return False


def _label_one(txn_id: int, category: str) -> bool:
    r = client.post(f"/txns/{txn_id}/categorize", json={"category": category})
    return r.status_code == 200


@pytest.mark.order(1)
def test_ml_suggest_empty_month_contract():
    """Empty month returns object with month + empty suggestions."""
    month = "2099-01"  # virtually guaranteed empty
    r = client.get(f"/ml/suggest?month={month}&limit=10&topk=3")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert isinstance(payload, dict)
    assert payload.get("month") == month
    assert "suggestions" in payload
    assert payload["suggestions"] == []


@pytest.mark.order(2)
def test_ml_suggest_happy_path_returns_candidates():
    """Labeled training data + similar unlabeled rows => non-empty suggestions with candidates (no 'Unknown')."""
    month = "2025-08"

    # Seed labeled rows (for model context)
    labeled_csv = textwrap.dedent("""\
        date,month,merchant,description,amount,category
        2025-08-10,2025-08,Costco,Groceries run,-85.40,Groceries
        2025-08-12,2025-08,Starbucks,Latte,-5.25,Shopping
        2025-08-13,2025-08,Uber,Ride home,-17.80,Transport
        2025-08-14,2025-08,Spotify,Family plan,-15.99,Subscriptions
        2025-08-15,2025-08,Delta,Flight,-250.00,Travel
    """)
    _ingest(labeled_csv)

    _maybe_train()

    # Unlabeled rows deliberately similar to training items
    unlabeled_csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-08-16,{month},Starbucks,Latte,-4.95,
        2025-08-17,{month},Uber,Ride to office,-19.80,
        2025-08-18,{month},Costco,Groceries run,-92.10,
    """)
    _ingest(unlabeled_csv)

    r = client.get(f"/ml/suggest?month={month}&limit=10&topk=3")
    assert r.status_code == 200, r.text
    payload = r.json()

    assert isinstance(payload, dict)
    assert payload.get("month") == month
    items = payload.get("suggestions") or []
    assert items, "Expected at least one suggestion item"

    # Each item should have candidates; none should be the literal 'Unknown'
    for item in items:
        cands = item.get("candidates") or item.get("topk") or []
        assert cands, f"No candidates for item: {item}"
        labels = [(c.get("label") or c.get("category")) for c in cands if (c.get("label") or c.get("category"))]
        assert labels and all(lbl != "Unknown" for lbl in labels), f"Unexpected 'Unknown' in {labels}"


@pytest.mark.order(3)
def test_ml_suggest_label_then_empty():
    """Use /ml/suggest as source of truth, label suggested txns (bulk if available), then verify it's empty."""
    month = "2025-08"

    # Baseline
    labeled_csv = textwrap.dedent("""\
        date,month,merchant,description,amount,category
        2025-08-10,2025-08,Costco,Groceries run,-85.40,Groceries
        2025-08-12,2025-08,Starbucks,Latte,-5.25,Shopping
        2025-08-13,2025-08,Uber,Ride home,-17.80,Transport
        2025-08-14,2025-08,Spotify,Family plan,-15.99,Subscriptions
    """)
    _ingest(labeled_csv)

    _maybe_train()

    # New rows that are likely to show up as suggestible
    unlabeled_csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-08-16,{month},Trader Joes,Groceries,-42.10,
        2025-08-17,{month},Uber,Ride to airport,-22.30,
        2025-08-18,{month},Amazon,Household,-34.99,
    """)
    _ingest(unlabeled_csv)

    # First call: whatever appears, label via public API (bulk preferred)
    r1 = client.get(f"/ml/suggest?month={month}&limit=50&topk=3")
    assert r1.status_code == 200, r1.text
    p1 = r1.json()
    assert isinstance(p1, dict) and p1.get("month") == month
    items = p1.get("suggestions") or []

    if items:
        ids = [it.get("txn_id") for it in items if it.get("txn_id") is not None]
        if ids:
            if not _bulk_label(ids, "Groceries"):
                # Fallback to per-txn if bulk is unavailable
                for tid in ids:
                    assert _label_one(tid, "Groceries"), f"Failed to label txn {tid}"

    # Second call: should be empty now for this month
    r2 = client.get(f"/ml/suggest?month={month}&limit=50&topk=3")
    assert r2.status_code == 200, r2.text
    p2 = r2.json()
    assert isinstance(p2, dict)
    assert p2.get("month") == month
    assert p2.get("suggestions") == [], f"Expected empty suggestions, got: {p2.get('suggestions')}"
