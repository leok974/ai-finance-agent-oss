import io
import textwrap
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

pytestmark = pytest.mark.agent_tools


def _ingest(csv_text: str):
    """Helper: upload CSV via your existing /ingest endpoint."""
    files = {"file": ("seed.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest", files=files)
    assert r.status_code in (200, 201), r.text


def _search(body: dict):
    return client.post("/agent/tools/transactions/search", json=body)


def _categorize(txn_ids, category: str):
    return client.post(
        "/agent/tools/transactions/categorize",
        json={"txn_ids": txn_ids, "category": category},
    )


def _get_by_ids(txn_ids):
    return client.post("/agent/tools/transactions/get_by_ids", json={"txn_ids": txn_ids})


def test_search_unlabeled_only_filters_and_orders():
    """Unlabeled-only should return only rows with None/''/'Unknown' and respect ordering/limits."""
    month = "2025-08"

    # Seed labeled and unlabeled rows
    labeled_csv = textwrap.dedent("""\
        date,month,merchant,description,amount,category
        2025-08-10,2025-08,Costco,Groceries run,-85.40,Groceries
        2025-08-11,2025-08,Starbucks,Latte,-5.25,Shopping
    """)
    _ingest(labeled_csv)

    unlabeled_csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-08-12,{month},Uber,Ride home,-17.80,
        2025-08-13,{month},Amazon,Household,-34.99,Unknown
        2025-08-14,{month},Trader Joes,Groceries,-42.10,
    """)
    _ingest(unlabeled_csv)

    # Search unlabeled only, Ordered by date desc (default), limit 2
    r = _search({
        "month": month,
        "unlabeled_only": True,
        "limit": 2
    })
    assert r.status_code == 200, r.text
    payload = r.json()
    assert set(payload.keys()) == {"total", "items"}
    assert isinstance(payload["total"], int)
    items = payload["items"]
    assert isinstance(items, list)
    # Limit respected
    assert len(items) <= 2
    # All are unlabeled by the tool's definition
    for it in items:
        cat = (it.get("category") or "").strip().lower()
        assert cat in ("", "unknown")

    # Ensure ordering is DESC by date (newest first)
    dates = [it["date"] for it in items]
    assert dates == sorted(dates, reverse=True)


def test_categorize_bulk_then_search_shows_no_longer_unlabeled():
    """Bulk categorize should move rows out of unlabeled-only search results."""
    month = "2025-09"

    # Seed some unlabeled rows
    unlabeled_csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-09-01,{month},Uber,Ride,-10.00,
        2025-09-02,{month},Amazon,HH,-12.34,Unknown
        2025-09-03,{month},Trader Joes,Groceries,-22.22,
    """)
    _ingest(unlabeled_csv)

    # First search: collect all unlabeled ids
    r1 = _search({"month": month, "unlabeled_only": True, "limit": 100})
    assert r1.status_code == 200, r1.text
    p1 = r1.json()
    ids = [it["id"] for it in p1["items"]]
    assert ids, "Expected unlabeled rows to categorize"

    # Bulk categorize to a real category
    r2 = _categorize(ids, "Groceries")
    assert r2.status_code == 200, r2.text
    p2 = r2.json()
    assert p2["updated"] == len(ids)
    assert p2["category"] == "Groceries"

    # Second search: unlabeled_only should be empty now
    r3 = _search({"month": month, "unlabeled_only": True, "limit": 100})
    assert r3.status_code == 200, r3.text
    p3 = r3.json()
    assert p3["items"] == []


def test_get_by_ids_roundtrip_and_empty_case():
    """get_by_ids returns DTOs for existing IDs and empty list for unknown IDs."""
    month = "2025-10"
    csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-10-01,{month},Costco,Groceries,-50.00,Groceries
        2025-10-02,{month},Starbucks,Coffee,-3.50,Shopping
    """)
    _ingest(csv)

    # Find their IDs via a search
    r = _search({"month": month, "limit": 10, "order_by": "id", "order_dir": "asc"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 2
    ids = [items[0]["id"], items[1]["id"]]

    # Round-trip via get_by_ids
    r2 = _get_by_ids(ids)
    assert r2.status_code == 200, r2.text
    p2 = r2.json()
    assert "items" in p2 and isinstance(p2["items"], list)
    got_ids = sorted([it["id"] for it in p2["items"]])
    assert got_ids == sorted(ids)

    # Empty-case: unknown ids
    r3 = _get_by_ids([999999, 999998])
    assert r3.status_code == 200
    assert r3.json()["items"] == []
