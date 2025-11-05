from typing import List, Dict, Any
from fastapi.testclient import TestClient
import pytest

pytestmark = pytest.mark.skip(
    reason="Legacy /ml/* endpoints removed; use /agent/tools/*"
)

from app.main import app  # noqa


def _set_txns(items: List[Dict[str, Any]]):
    app.state.txns = list(items)


# ---------- /budget/check ----------


def test_budget_check_empty_returns_400_or_empty_payload():
    original_txns = getattr(app.state, "txns", [])
    _set_txns([])
    try:
        client = TestClient(app)
        r = client.get("/budget/check")
        if r.status_code == 400:
            data = r.json()
            assert "detail" in data and "No transactions loaded" in data["detail"]
        else:
            assert r.status_code == 200
            data = r.json()
            # Endpoint may return a list or an object {month, budget_items: []}
            if isinstance(data, list):
                assert data == [] or len(data) == 0
            else:
                # dict
                items = data.get("budget_items", [])
                assert isinstance(items, list)
                assert len(items) == 0
    finally:
        _set_txns(original_txns)


def test_budget_check_with_data_returns_items():
    original_txns = getattr(app.state, "txns", [])
    # Provide a tiny dataset with expenses in categories likely covered by your default rules
    sample = [
        {
            "id": 1,
            "date": "2025-08-02",
            "amount": -50.00,
            "merchant": "Grocer",
            "description": "Food",
            "category": "Groceries",
        },
        {
            "id": 2,
            "date": "2025-08-05",
            "amount": -25.00,
            "merchant": "Uber",
            "description": "Ride",
            "category": "Transport",
        },
        {
            "id": 3,
            "date": "2025-08-06",
            "amount": 120.00,
            "merchant": "Payroll",
            "description": "Paycheck",
            "category": "Income",
        },
    ]
    _set_txns(sample)
    try:
        client = TestClient(app)
        r = client.get("/budget/check")
        assert r.status_code == 200
        data = r.json()
        # Accept both shapes: list OR {month, budget_items}
        items = data if isinstance(data, list) else data.get("budget_items", [])
        assert isinstance(items, list)
        # Should contain dicts with at least category, spent, limit, over
        assert all(isinstance(x, dict) for x in items)
        keyset = set().union(*(x.keys() for x in items)) if items else set()
        assert {"category", "spent", "limit"}.issubset(keyset)
    finally:
        _set_txns(original_txns)


# ---------- /txns/unknowns ----------


def test_unknowns_empty_returns_400_or_empty_object():
    original_txns = getattr(app.state, "txns", [])
    _set_txns([])
    try:
        client = TestClient(app)
        r = client.get("/txns/unknowns")
        if r.status_code == 400:
            data = r.json()
            assert "detail" in data and "No transactions loaded" in data["detail"]
        else:
            assert r.status_code == 200
            data = r.json()
            # Expect dict with month and unknowns list (possibly empty / month=None)
            assert isinstance(data, dict)
            assert "unknowns" in data
            assert isinstance(data["unknowns"], list)
            # month may be None/"" in empty mode
            assert "month" in data
    finally:
        _set_txns(original_txns)


def test_unknowns_with_data_returns_uncategorized_list_and_month():
    original_txns = getattr(app.state, "txns", [])
    sample = [
        {
            "id": 1,
            "date": "2025-08-03",
            "amount": -12.40,
            "merchant": "Chipotle",
            "description": "Burrito",
            "category": "Unknown",
        },
        {
            "id": 2,
            "date": "2025-08-05",
            "amount": -30.00,
            "merchant": "Grocer",
            "description": "Food",
            "category": "Groceries",
        },
        {
            "id": 3,
            "date": "2025-07-31",
            "amount": -7.99,
            "merchant": "Coffee",
            "description": "Latte",
            "category": "Unknown",
        },
    ]
    _set_txns(sample)
    try:
        client = TestClient(app)
        r = client.get("/txns/unknowns")
        assert r.status_code == 200
        data = r.json()
        assert "month" in data
        assert data["month"] == "2025-08"  # latest month defaults
        assert "unknowns" in data and isinstance(data["unknowns"], list)
        # Should include the 2025-08 Unknown but not the 2025-07 one (different month)
        ids = {t["id"] for t in data["unknowns"]}
        assert 1 in ids
        assert 3 not in ids
    finally:
        _set_txns(original_txns)


# ---------- /ml/suggest ----------


def test_ml_suggest_empty_returns_400_or_empty_object():
    original_txns = getattr(app.state, "txns", [])
    _set_txns([])
    try:
        client = TestClient(app)
        r = client.get("/ml/suggest")
        if r.status_code == 400:
            data = r.json()
            assert "detail" in data and "No transactions loaded" in data["detail"]
        else:
            assert r.status_code == 200
            data = r.json()
            # Expect dict with suggestions list; month may be null/empty
            assert isinstance(data, dict)
            assert "suggestions" in data and isinstance(data["suggestions"], list)
            assert "month" in data
    finally:
        _set_txns(original_txns)


def test_ml_suggest_with_data_returns_suggestions_and_month():
    original_txns = getattr(app.state, "txns", [])
    sample = [
        {
            "id": 1,
            "date": "2025-08-03",
            "amount": -12.40,
            "merchant": "Chipotle",
            "description": "Burrito",
            "category": "Unknown",
        },
        {
            "id": 2,
            "date": "2025-08-05",
            "amount": -30.00,
            "merchant": "Grocer",
            "description": "Food",
            "category": "Groceries",
        },
        {
            "id": 3,
            "date": "2025-08-06",
            "amount": 120.00,
            "merchant": "Payroll",
            "description": "Paycheck",
            "category": "Income",
        },
    ]
    _set_txns(sample)
    try:
        client = TestClient(app)
        r = client.get("/ml/suggest")
        assert r.status_code == 200
        data = r.json()
        assert "month" in data and data["month"] == "2025-08"
        assert "suggestions" in data and isinstance(data["suggestions"], list)
        # We don't assert exact suggestion content (depends on your logic),
        # but the structure should be list[dict] or similar.
        assert all(isinstance(x, (dict, str)) for x in data["suggestions"])
    finally:
        _set_txns(original_txns)
