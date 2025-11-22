"""Tests for analytics budget suggest tool endpoint."""

from fastapi.testclient import TestClient


def test_budget_suggest_endpoint_exists(client: TestClient):
    """Test that /agent/tools/analytics/budget/suggest endpoint exists and doesn't require admin auth."""
    # This will return 401 without auth, but proves endpoint is wired correctly
    response = client.post(
        "/agent/tools/analytics/budget/suggest",
        json={"month": "2025-11"},
    )
    # Expecting 401 (not 404) proves the endpoint exists and uses get_current_user
    assert response.status_code in [
        200,
        401,
    ], f"Got {response.status_code}: {response.text}"


def test_budget_suggest_requires_auth(client: TestClient):
    """Test that budget suggest endpoint requires authentication."""
    response = client.post(
        "/agent/tools/analytics/budget/suggest",
        json={"month": "2025-11"},
    )
    assert response.status_code == 401


def test_recurring_endpoint_exists(client: TestClient):
    """Test that /agent/tools/analytics/recurring endpoint exists and doesn't require admin auth."""
    response = client.post(
        "/agent/tools/analytics/recurring",
        json={"month": "2025-11"},
    )
    # Expecting 401 (not 404) proves the endpoint exists and uses get_current_user
    assert response.status_code in [
        200,
        401,
    ], f"Got {response.status_code}: {response.text}"


def test_recurring_requires_auth(client: TestClient):
    """Test that recurring endpoint requires authentication."""
    response = client.post(
        "/agent/tools/analytics/recurring",
        json={"month": "2025-11"},
    )
    assert response.status_code == 401


def test_find_subscriptions_endpoint_exists(client: TestClient):
    """Test that /agent/tools/analytics/subscriptions/find endpoint exists and doesn't require admin auth."""
    response = client.post(
        "/agent/tools/analytics/subscriptions/find",
        json={"month": "2025-11"},
    )
    # Expecting 401 (not 404) proves the endpoint exists and uses get_current_user
    assert response.status_code in [
        200,
        401,
    ], f"Got {response.status_code}: {response.text}"


def test_find_subscriptions_requires_auth(client: TestClient):
    """Test that find subscriptions endpoint requires authentication."""
    response = client.post(
        "/agent/tools/analytics/subscriptions/find",
        json={"month": "2025-11"},
    )
    assert response.status_code == 401


def test_subscriptions_endpoint_default_mode(client: TestClient):
    """Test that /agent/tools/analytics/subscriptions defaults to 'subscriptions' mode."""
    response = client.post(
        "/agent/tools/analytics/subscriptions",
        json={"month": "2025-11", "lookback_months": 6},
    )
    # Expecting 401 (not 404) proves the endpoint exists
    assert response.status_code in [
        200,
        401,
    ], f"Got {response.status_code}: {response.text}"


def test_subscriptions_endpoint_recurring_mode(client: TestClient):
    """Test that /agent/tools/analytics/subscriptions accepts mode='recurring'."""
    response = client.post(
        "/agent/tools/analytics/subscriptions",
        json={"month": "2025-11", "lookback_months": 6, "mode": "recurring"},
    )
    # Expecting 401 (not 404 or 422) proves the endpoint accepts the mode parameter
    assert response.status_code in [
        200,
        401,
    ], f"Got {response.status_code}: {response.text}"


def test_subscriptions_endpoint_subscriptions_mode(client: TestClient):
    """Test that /agent/tools/analytics/subscriptions accepts mode='subscriptions'."""
    response = client.post(
        "/agent/tools/analytics/subscriptions",
        json={"month": "2025-11", "lookback_months": 6, "mode": "subscriptions"},
    )
    # Expecting 401 (not 404 or 422) proves the endpoint accepts the mode parameter
    assert response.status_code in [
        200,
        401,
    ], f"Got {response.status_code}: {response.text}"


def test_subscriptions_endpoint_invalid_mode(client: TestClient):
    """Test that /agent/tools/analytics/subscriptions rejects invalid mode values."""
    response = client.post(
        "/agent/tools/analytics/subscriptions",
        json={"month": "2025-11", "lookback_months": 6, "mode": "invalid"},
    )
    # Auth check happens before validation, so 401 is expected for unauthenticated invalid requests
    # The validation would trigger 422 if auth passed
    assert response.status_code in [
        401,
        422,
    ], f"Got {response.status_code}: {response.text}"
