"""
Test cascade behavior for suggestion feedback when transactions are deleted.

This test validates that the DB migration 20251104_fk_feedback_event_cascade
correctly implements ON DELETE SET NULL for suggestion_feedback.event_id.
"""
import pytest
from app.db import SessionLocal
from app.transactions import Transaction
from app.models.suggestions import SuggestionEvent, SuggestionFeedback, SuggestionAction
import datetime
import uuid


def test_transaction_delete_cascades_to_events_nulls_feedback():
    """
    GIVEN: A transaction with associated suggestion event and feedback
    WHEN: The transaction is deleted
    THEN:
      - The suggestion_event is deleted (CASCADE)
      - The suggestion_feedback remains with event_id=NULL (SET NULL)
    
    This is the core behavior that fixes the /ingest?replace=true 500 errors.
    """
    db = SessionLocal()
    try:
        # Create a transaction
        txn = Transaction(
            date=datetime.date.today(),
            amount=-50.0,
            description="Test transaction",
            month="2025-11"
        )
        db.add(txn)
        db.flush()  # Get txn.id
        
        # Create a suggestion event for this transaction
        event = SuggestionEvent(
            txn_id=txn.id,
            model_id="test_model",
            candidates=[{"label": "groceries", "confidence": 0.9}],
            mode="test"
        )
        db.add(event)
        db.flush()  # Get event.id
        
        # Create feedback linked to this event
        feedback = SuggestionFeedback(
            event_id=event.id,
            txn_id=txn.id,
            action=SuggestionAction.accept,
            label="groceries",
            confidence=0.9
        )
        db.add(feedback)
        db.commit()
        
        # Remember IDs for later verification
        txn_id = txn.id
        event_id = event.id
        feedback_id = feedback.id
        
        # DELETE the transaction (mimics /ingest?replace=true)
        db.query(Transaction).filter(Transaction.id == txn_id).delete()
        db.commit()
        
        # Verify cascade behavior
        # 1. Event should be deleted (CASCADE)
        remaining_event = db.get(SuggestionEvent, event_id)
        assert remaining_event is None, "Event should be deleted via CASCADE"
        
        # 2. Feedback should remain but with event_id=NULL (SET NULL)
        remaining_feedback = db.get(SuggestionFeedback, feedback_id)
        assert remaining_feedback is not None, "Feedback should remain (not cascaded)"
        assert remaining_feedback.event_id is None, "Feedback.event_id should be NULL after cascade"
        assert remaining_feedback.txn_id == txn_id, "Feedback.txn_id should remain unchanged"
        assert remaining_feedback.label == "groceries", "Feedback content should be preserved"
        
        print("✅ Cascade test passed: transactions → events (DELETE), feedback.event_id (SET NULL)")
        
    finally:
        db.rollback()
        db.close()


def test_ingest_replace_multiple_cycles():
    """
    GIVEN: Multiple transactions with events and feedback
    WHEN: /ingest?replace=true is called multiple times
    THEN: No FK violations occur, and orphaned feedback accumulates
    
    This simulates the real production usage pattern.
    """
    db = SessionLocal()
    try:
        for cycle in range(3):
            # Create transaction with feedback
            txn = Transaction(
                date=datetime.date.today(),
                amount=-100.0 - cycle,
                description=f"Cycle {cycle}",
                month="2025-11"
            )
            db.add(txn)
            db.flush()
            
            event = SuggestionEvent(
                txn_id=txn.id,
                candidates=[{"label": "test"}],
                mode="test"
            )
            db.add(event)
            db.flush()
            
            feedback = SuggestionFeedback(
                event_id=event.id,
                txn_id=txn.id,
                action=SuggestionAction.accept,
                label="test"
            )
            db.add(feedback)
            db.commit()
            
            # Simulate replace: delete all transactions
            db.query(Transaction).delete()
            db.commit()
            
            # Verify clean state (no FK violations)
            assert db.query(Transaction).count() == 0
            assert db.query(SuggestionEvent).count() == 0
            # Orphaned feedback accumulates (event_id=NULL)
            assert db.query(SuggestionFeedback).count() == cycle + 1
        
        print(f"✅ Multiple replace cycles succeeded without FK violations")
        print(f"   Orphaned feedback count: {db.query(SuggestionFeedback).count()}")
        
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    test_transaction_delete_cascades_to_events_nulls_feedback()
    test_ingest_replace_multiple_cycles()
    print("\n✅ All cascade behavior tests passed!")
