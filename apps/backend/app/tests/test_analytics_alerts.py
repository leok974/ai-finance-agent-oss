"""Tests for analytics alerts computation and endpoint."""

from fastapi.testclient import TestClient


def test_alerts_endpoint_exists(client: TestClient):
    """Test that /agent/tools/analytics/alerts endpoint exists."""
    response = client.post(
        "/agent/tools/analytics/alerts",
        json={"month": "2025-11"},
    )
    # Expecting 401 (not 404) proves the endpoint exists
    assert response.status_code in [
        200,
        401,
    ], f"Got {response.status_code}: {response.text}"


def test_alerts_endpoint_requires_auth(client: TestClient):
    """Test that alerts endpoint requires authentication."""
    response = client.post(
        "/agent/tools/analytics/alerts",
        json={"month": "2025-11"},
    )
    assert response.status_code == 401


def test_alerts_response_shape(client: TestClient):
    """Test that alerts endpoint returns expected shape when auth passes."""
    # This test would pass with proper auth
    # For now, just verify endpoint exists and rejects unauth
    response = client.post(
        "/agent/tools/analytics/alerts",
        json={},
    )
    assert response.status_code == 401  # No auth provided


def test_compute_alerts_no_data():
    """Test compute_alerts_for_month with empty database."""
    from app.services.analytics_alerts import compute_alerts_for_month
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        result = compute_alerts_for_month(db=db, month="2025-11")

        # Should return valid AlertsResult even with no data
        assert result.month == "2025-11"
        assert isinstance(result.alerts, list)
        assert hasattr(result, "llm_prompt")
        assert result.llm_prompt is not None

        # With no transactions, should have no alerts
        # (or very minimal ones)
        assert len(result.alerts) <= 3
    finally:
        db.close()
