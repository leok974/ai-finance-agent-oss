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


def _label_one(txn_id: int, category: str) -> bool:
    r = client.post(f"/txns/{txn_id}/categorize", json={"category": category})
    return r.status_code == 200


@pytest.mark.order(1)
def test_ml_suggest_empty_after_labeling_month():
    month = "2025-08"

    # 1) Seed some baseline rows
    labeled_csv = textwrap.dedent("""\
        date,month,merchant,description,amount,category
        2025-08-10,2025-08,Costco,Groceries run,-85.40,Groceries
        2025-08-12,2025-08,Starbucks,Latte,-5.25,Shopping
        2025-08-13,2025-08,Uber,Ride home,-17.80,Transport
        2025-08-14,2025-08,Spotify,Family plan,-15.99,Subscriptions
    """)
    _ingest(labeled_csv)

    # 2) Seed entries that may show up as unlabeled for ML
    unlabeled_csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-08-16,{month},Trader Joes,Groceries,-42.10,
        2025-08-17,{month},Uber,Ride to airport,-22.30,
        2025-08-18,{month},Amazon,Household,-34.99,
    """)
    _ingest(unlabeled_csv)

    # 3) First call: whatever the app considers suggestible should appear here
    r = client.get(f"/ml/suggest?month={month}&limit=50&topk=3")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert isinstance(payload, dict) and "suggestions" in payload and payload.get("month") == month

    suggestions = payload["suggestions"] or []
    if not suggestions:
        # Already empty; nothing to label, and the contract holds
        return

    # 4) Label every suggested txn via the public API
    labeled_any = False
    for item in suggestions:
        tid = item.get("txn_id")
        if tid is None:
            continue
        assert _label_one(tid, "Groceries"), f"Failed to label txn {tid}"
        labeled_any = True

    assert labeled_any, "Expected to label at least one suggested transaction"

    # 5) Second call must be empty for that month now
    r2 = client.get(f"/ml/suggest?month={month}&limit=50&topk=3")
    assert r2.status_code == 200, r2.text
    payload2 = r2.json()
    assert isinstance(payload2, dict)
    assert payload2.get("month") == month
    assert payload2.get("suggestions") == [], f"Expected empty suggestions, got: {payload2.get('suggestions')}"
