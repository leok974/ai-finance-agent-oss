"""
Test spending trends chart endpoint.

Coverage:
- Route exists and returns correct shape (200 or 401)
- Validates months parameter
- Data sorted chronologically when present
"""

import pytest


@pytest.mark.httpapi
def test_spending_trends_route_exists(client):
    """Verify spending trends route exists (not 404)."""
    response = client.get("/charts/spending_trends")

    # Route should exist (not 404)
    assert response.status_code != 404, "Spending trends route returned 404"

    # Expected: 200 (success) or 401 (auth required)
    assert response.status_code in (
        200,
        401,
    ), f"Expected 200/401, got {response.status_code}"


@pytest.mark.httpapi
def test_spending_trends_returns_valid_structure(client):
    """GET /charts/spending_trends should return valid JSON structure."""
    response = client.get("/charts/spending_trends")

    # Skip structure validation if auth is required
    if response.status_code == 401:
        pytest.skip("Auth required - cannot test structure without credentials")

    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    data = response.json()

    # Validate structure
    assert "months" in data, "Response missing 'months' field"
    assert "trends" in data, "Response missing 'trends' field"
    assert isinstance(data["months"], int), "months should be an integer"
    assert isinstance(data["trends"], list), "trends should be a list"

    # If there's data, validate structure
    if data["trends"]:
        trend = data["trends"][0]
        assert "month" in trend, "Trend missing 'month' field"
        assert "spending" in trend, "Trend missing 'spending' field"
        assert "income" in trend, "Trend missing 'income' field"
        assert "net" in trend, "Trend missing 'net' field"

        # Validate types
        assert isinstance(trend["month"], str), "month should be a string"
        assert isinstance(trend["spending"], (int, float)), "spending should be numeric"
        assert isinstance(trend["income"], (int, float)), "income should be numeric"
        assert isinstance(trend["net"], (int, float)), "net should be numeric"


@pytest.mark.httpapi
def test_spending_trends_respects_months_param(client):
    """Verify months parameter is accepted."""
    # Request last 3 months
    response = client.get("/charts/spending_trends?months=3")

    # Should not fail with validation error (422)
    assert response.status_code != 422, "months parameter rejected with 422"
    assert response.status_code in (
        200,
        401,
    ), f"Expected 200/401, got {response.status_code}"

    # If successful, verify months is reflected
    if response.status_code == 200:
        data = response.json()
        assert data["months"] == 3, f"Expected months=3, got {data['months']}"


@pytest.mark.httpapi
def test_spending_trends_sorted_ascending(client):
    """Verify trends are sorted chronologically when data exists."""
    response = client.get("/charts/spending_trends")

    # Skip if auth required
    if response.status_code == 401:
        pytest.skip("Auth required - cannot test sorting without credentials")

    assert response.status_code == 200
    data = response.json()

    if len(data["trends"]) > 1:
        # Check that months are in ascending order
        months = [t["month"] for t in data["trends"]]
        sorted_months = sorted(months)
        assert months == sorted_months, f"Months not sorted: {months}"


# Note: User isolation test requires database fixtures with multiple users.
# Documented here as a test case to implement when full integration test
# infrastructure is available:
#
# test_spending_trends_excludes_other_users:
#   - Create transactions for user A and user B
#   - Request spending trends as user A
#   - Verify response only contains user A's data
#   - SQL filter enforced: .filter(Transaction.user_id == user_id)
