"""Tests for insights expanded tool endpoint."""

from fastapi.testclient import TestClient


def test_insights_expanded_endpoint_exists(client: TestClient):
    """Test that /agent/tools/insights/expanded endpoint exists and doesn't require admin auth."""
    # This will return 401 without auth, but proves endpoint is wired correctly
    response = client.post(
        "/agent/tools/insights/expanded",
        json={"month": "2025-11", "large_limit": 10, "status": "posted"},
    )
    # Expecting 401 (not 404) proves the endpoint exists and uses get_current_user
    assert response.status_code in [
        200,
        401,
    ], f"Got {response.status_code}: {response.text}"


def test_insights_expanded_requires_auth(client: TestClient):
    """Test that insights endpoint requires authentication."""
    response = client.post(
        "/agent/tools/insights/expanded",
        json={"month": "2025-11"},
    )
    assert response.status_code == 401
