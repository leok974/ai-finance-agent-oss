"""Contract tests for ML suggestions API endpoint."""

import pytest
from fastapi.testclient import TestClient


def test_suggestions_happy_path(client):
    """Test successful suggestions generation with valid transaction ID."""
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": ["999001"], "top_k": 2, "mode": "auto"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert len(data["items"]) >= 1

    item = data["items"][0]
    assert item["txn_id"] == "999001"
    assert "candidates" in item
    assert len(item["candidates"]) >= 1
    assert "event_id" in item

    # Validate candidate structure
    candidate = item["candidates"][0]
    assert "label" in candidate
    assert "confidence" in candidate
    assert "reasons" in candidate
    assert 0 <= candidate["confidence"] <= 1


def test_suggestions_multiple_transactions(client):
    """Test suggestions for multiple transaction IDs."""
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": ["999001", "999002"], "top_k": 3, "mode": "auto"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    # May have fewer items if some txns not found, but should have at least one
    assert len(data["items"]) >= 1


def test_suggestions_integer_ids(client):
    """Test that integer transaction IDs are accepted."""
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": [999001], "top_k": 1, "mode": "auto"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data


def test_suggestions_bad_id_string(client):
    """Test that invalid string IDs return 400 with helpful message."""
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": ["not-a-number"], "top_k": 1, "mode": "auto"},
    )
    assert r.status_code == 400
    data = r.json()
    assert "detail" in data
    assert "Invalid txn_id" in data["detail"]
    assert "not-a-number" in data["detail"]


def test_suggestions_bad_id_null(client):
    """Test that null IDs return 400."""
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": [None], "top_k": 1, "mode": "auto"},
    )
    assert r.status_code == 400


def test_suggestions_empty_list(client):
    """Test that empty txn_ids list returns empty items."""
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": [], "top_k": 1, "mode": "auto"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert len(data["items"]) == 0


def test_suggestions_nonexistent_id(client):
    """Test that non-existent transaction IDs are skipped gracefully."""
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": ["9999999"], "top_k": 1, "mode": "auto"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    # Should return empty if transaction doesn't exist
    assert len(data["items"]) == 0


def test_feedback_accept(client):
    """Test suggestion feedback acceptance."""
    # First get a suggestion
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": ["999001"], "top_k": 1, "mode": "auto"},
    )
    assert r.status_code == 200
    event_id = r.json()["items"][0]["event_id"]

    # Send feedback
    r = client.post(
        "/ml/suggestions/feedback",
        json={"event_id": event_id, "action": "accept"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True


def test_feedback_reject(client):
    """Test suggestion feedback rejection."""
    # First get a suggestion
    r = client.post(
        "/ml/suggestions",
        json={"txn_ids": ["999002"], "top_k": 1, "mode": "auto"},
    )
    assert r.status_code == 200
    event_id = r.json()["items"][0]["event_id"]

    # Send feedback
    r = client.post(
        "/ml/suggestions/feedback",
        json={"event_id": event_id, "action": "reject", "reason": "wrong"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True


def test_feedback_invalid_event_id(client):
    """Test feedback with non-existent event ID."""
    r = client.post(
        "/ml/suggestions/feedback",
        json={
            "event_id": "00000000-0000-0000-0000-000000000000",
            "action": "accept",
        },
    )
    # Should handle gracefully (404 or 400)
    assert r.status_code in [400, 404]
