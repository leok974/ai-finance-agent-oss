"""Tests for ML suggestion acceptance endpoint."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.orm_models import Suggestion
from app.services.suggest.metrics import ml_suggestion_accepts_total


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def db():
    """Create a database session."""
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def sample_suggestion(db):
    """Create a sample suggestion in the database."""
    suggestion = Suggestion(
        txn_id="test-123",
        label="Shopping",
        confidence=0.95,
        source="rule",
        model_version="merchant-majority@v1",
        reason_json=[
            {
                "source": "merchant_majority",
                "merchant": "Amazon",
                "support": 5,
                "total": 5,
                "p": 1.0,
            }
        ],
        accepted=None,
        mode="auto",
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)
    return suggestion


def test_accept_suggestion_success(client, db, sample_suggestion):
    """Test accepting a suggestion successfully."""
    response = client.post(f"/ml/suggestions/{sample_suggestion.id}/accept")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["id"] == sample_suggestion.id
    assert data["accepted"] is True

    # Verify database updated
    db.refresh(sample_suggestion)
    assert sample_suggestion.accepted is True


def test_accept_suggestion_idempotent(client, db, sample_suggestion):
    """Test that accepting an already-accepted suggestion is idempotent."""
    # Get initial metric value
    initial_count = ml_suggestion_accepts_total.labels(
        model_version="merchant-majority@v1", source="rule", label="Shopping"
    )._value.get()

    # First accept
    response1 = client.post(f"/ml/suggestions/{sample_suggestion.id}/accept")
    assert response1.status_code == 200
    assert response1.json()["accepted"] is True

    # Metric should increment once
    count_after_first = ml_suggestion_accepts_total.labels(
        model_version="merchant-majority@v1", source="rule", label="Shopping"
    )._value.get()
    assert count_after_first == initial_count + 1

    # Second accept (idempotent)
    response2 = client.post(f"/ml/suggestions/{sample_suggestion.id}/accept")
    assert response2.status_code == 200
    assert response2.json()["accepted"] is True

    # Metric should NOT increment again
    count_after_second = ml_suggestion_accepts_total.labels(
        model_version="merchant-majority@v1", source="rule", label="Shopping"
    )._value.get()
    assert (
        count_after_second == count_after_first
    ), "Metric should not double-count on idempotent accept"


def test_accept_suggestion_not_found(client):
    """Test accepting a non-existent suggestion returns 404."""
    response = client.post("/ml/suggestions/999999/accept")

    assert response.status_code == 404
    assert response.json()["detail"] == "Suggestion not found"


def test_accept_suggestion_with_null_fields(client, db):
    """Test accepting a suggestion with null model_version/source fields."""
    suggestion = Suggestion(
        txn_id="test-456",
        label="Dining",
        confidence=0.80,
        source=None,  # Null source
        model_version=None,  # Null model version
        accepted=None,
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)

    # Should still work, using "n/a" for null fields in metric labels
    response = client.post(f"/ml/suggestions/{suggestion.id}/accept")

    assert response.status_code == 200
    assert response.json()["accepted"] is True

    # Verify metric emitted with "n/a" labels
    metric_value = ml_suggestion_accepts_total.labels(
        model_version="n/a", source="n/a", label="Dining"
    )._value.get()
    assert metric_value > 0


def test_accept_updates_only_accepted_field(client, db, sample_suggestion):
    """Test that accept only updates the accepted field, not others."""
    original_label = sample_suggestion.label
    original_confidence = sample_suggestion.confidence
    original_source = sample_suggestion.source

    response = client.post(f"/ml/suggestions/{sample_suggestion.id}/accept")
    assert response.status_code == 200

    # Refresh and verify other fields unchanged
    db.refresh(sample_suggestion)
    assert sample_suggestion.label == original_label
    assert sample_suggestion.confidence == original_confidence
    assert sample_suggestion.source == original_source
    assert sample_suggestion.accepted is True  # Only this changed
