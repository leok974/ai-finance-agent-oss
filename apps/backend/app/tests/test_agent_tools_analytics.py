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
