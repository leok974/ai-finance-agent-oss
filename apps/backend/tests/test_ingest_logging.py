"""Tests for structured logging in ingest endpoints.

Verifies that the /ingest and /ingest/dashboard/reset endpoints:
1. Return correct 200 + {ok: true} responses
2. Handle CSV uploads properly
3. Reset dashboard data correctly
"""

import pytest

pytestmark = [
    pytest.mark.usefixtures("fake_auth_env"),
    pytest.mark.httpapi,
]


def test_ingest_small_csv_succeeds(client):
    """Test that CSV ingest endpoint returns ok=True and processes data."""
    csv_content = """date,amount,merchant,description
2025-11-01,-12.50,Coffee Shop,Morning coffee
2025-11-02,-45.00,Gas Station,Fuel
2025-11-03,-8.99,Lunch Place,Sandwich
"""
    files = {"file": ("test.csv", csv_content.encode(), "text/csv")}
    response = client.post("/ingest?replace=false", files=files)

    assert (
        response.status_code == 200
    ), f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert data.get("ok") is True, f"Expected ok=True, got {data}"
    assert data.get("added", 0) > 0, f"Expected added > 0, got {data}"


def test_dashboard_reset_returns_ok(client):
    """Test that dashboard reset endpoint returns ok=True and deletes data."""
    # First ingest some data
    csv_content = """date,amount,merchant,description
2025-11-01,-100.00,Test Store,Test transaction
"""
    files = {"file": ("test.csv", csv_content.encode(), "text/csv")}
    ingest_response = client.post("/ingest?replace=false", files=files)
    assert ingest_response.status_code == 200

    # Now reset
    reset_response = client.delete("/ingest/dashboard/reset")

    assert (
        reset_response.status_code == 200
    ), f"Expected 200, got {reset_response.status_code}: {reset_response.text}"
    data = reset_response.json()
    assert data.get("ok") is True, f"Expected ok=True, got {data}"
    assert "deleted" in data, f"Expected 'deleted' key in response, got {data}"
