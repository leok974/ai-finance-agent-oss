"""Integration tests for suggestion feedback endpoint with enhanced schema.

Tests the complete flow:
1. Create suggestion feedback with new schema (txn_id, label, confidence)
2. Verify data persisted correctly
3. Test validation (required fields, enum values)
4. Test optional event_id linking
"""

import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.suggestions import SuggestionFeedback, SuggestionEvent, SuggestionAction
from app.db import SessionLocal


client = TestClient(app)


@pytest.fixture
def db():
    """Get database session for tests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_feedback_minimal_required_fields(db: Session):
    """Test feedback creation with only required fields (txn_id, action, label)."""
    payload = {
        "txn_id": 1001,
        "action": "accept",
        "label": "Groceries"
    }
    
    response = client.post("/ml/suggestions/feedback", json=payload)
    
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    
    # Verify in database
    feedback = db.query(SuggestionFeedback).filter(
        SuggestionFeedback.txn_id == 1001
    ).first()
    
    assert feedback is not None
    assert feedback.action == SuggestionAction.accept
    assert feedback.label == "Groceries"
    assert feedback.event_id is None
    assert feedback.confidence is None
    assert feedback.reason is None
    assert feedback.user_id is None
    assert feedback.created_at is not None
    
    # Cleanup
    db.delete(feedback)
    db.commit()


def test_feedback_all_fields(db: Session):
    """Test feedback creation with all optional fields."""
    payload = {
        "txn_id": 1002,
        "action": "reject",
        "label": "Entertainment",
        "confidence": 0.85,
        "reason": "Should be streaming service",
        "user_id": "test_user_123"
    }
    
    response = client.post("/ml/suggestions/feedback", json=payload)
    
    assert response.status_code == 200
    
    # Verify in database
    feedback = db.query(SuggestionFeedback).filter(
        SuggestionFeedback.txn_id == 1002
    ).first()
    
    assert feedback is not None
    assert feedback.action == SuggestionAction.reject
    assert feedback.label == "Entertainment"
    assert feedback.confidence == 0.85
    assert feedback.reason == "Should be streaming service"
    assert feedback.user_id == "test_user_123"
    
    # Cleanup
    db.delete(feedback)
    db.commit()


def test_feedback_invalid_action(db: Session):
    """Test that invalid action values are rejected."""
    payload = {
        "txn_id": 1003,
        "action": "maybe",  # Invalid - only accept/reject allowed
        "label": "Groceries"
    }
    
    response = client.post("/ml/suggestions/feedback", json=payload)
    
    assert response.status_code == 422  # Validation error


def test_feedback_missing_required_field(db: Session):
    """Test that missing required fields are rejected."""
    payload = {
        "txn_id": 1004,
        "action": "accept"
        # Missing label
    }
    
    response = client.post("/ml/suggestions/feedback", json=payload)
    
    assert response.status_code == 422


def test_feedback_with_event_id_link(db: Session):
    """Test feedback linking to an existing suggestion event."""
    # First create a suggestion event
    event = SuggestionEvent(
        id=uuid.uuid4(),
        txn_id=1005,
        model_id="test_model",
        candidates=[{"label": "Food", "confidence": 0.9}],
        mode="auto"
    )
    db.add(event)
    db.commit()
    
    try:
        # Now create feedback linked to this event
        payload = {
            "txn_id": 1005,
            "action": "accept",
            "label": "Food",
            "event_id": str(event.id)
        }
        
        response = client.post("/ml/suggestions/feedback", json=payload)
        
        assert response.status_code == 200
        
        # Verify link in database
        feedback = db.query(SuggestionFeedback).filter(
            SuggestionFeedback.txn_id == 1005
        ).first()
        
        assert feedback is not None
        assert feedback.event_id == event.id
        
        # Cleanup
        db.delete(feedback)
        db.commit()
    finally:
        # Cleanup event
        db.delete(event)
        db.commit()


def test_feedback_invalid_event_id(db: Session):
    """Test that invalid event_id is rejected."""
    payload = {
        "txn_id": 1006,
        "action": "accept",
        "label": "Groceries",
        "event_id": str(uuid.uuid4())  # Non-existent event
    }
    
    response = client.post("/ml/suggestions/feedback", json=payload)
    
    assert response.status_code == 404
    assert "event not found" in response.json()["detail"]


def test_feedback_metrics_increment(db: Session):
    """Test that feedback increments the appropriate Prometheus metrics."""
    from app.services.metrics import SUGGESTIONS_ACCEPT, SUGGESTIONS_REJECT
    
    # Get initial metric values
    accept_before = SUGGESTIONS_ACCEPT.labels(label="TestCategory")._value.get()
    
    payload = {
        "txn_id": 1007,
        "action": "accept",
        "label": "TestCategory"
    }
    
    response = client.post("/ml/suggestions/feedback", json=payload)
    assert response.status_code == 200
    
    # Check metric incremented
    accept_after = SUGGESTIONS_ACCEPT.labels(label="TestCategory")._value.get()
    assert accept_after == accept_before + 1
    
    # Cleanup
    feedback = db.query(SuggestionFeedback).filter(
        SuggestionFeedback.txn_id == 1007
    ).first()
    if feedback:
        db.delete(feedback)
        db.commit()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
