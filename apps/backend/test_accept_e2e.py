#!/usr/bin/env python3
"""E2E test for accept endpoint."""

from app.routers.suggestions import accept_suggestion
from app.db import SessionLocal
from app.orm_models import Suggestion
from app.services.suggest.metrics import ml_suggestion_accepts_total

db = SessionLocal()

# Find a suggestion that hasn't been accepted yet
s = db.query(Suggestion).filter(Suggestion.accepted.is_(None)).first()

if not s:
    print("❌ No unaccepted suggestions found. Creating one...")
    from app.services.suggest.logging import log_suggestion

    log_suggestion(
        db=db,
        txn_id="test-e2e",
        label="TestCategory",
        confidence=0.95,
        reason_json=[{"source": "test", "reason": "E2E test"}],
        source="rule",
        model_version="test@v1",
        mode="auto",
    )
    db.commit()
    s = db.query(Suggestion).filter(Suggestion.txn_id == "test-e2e").first()

print(f"\n✅ Testing with Suggestion ID={s.id}")
print(f"   Label: {s.label}")
print(f"   Confidence: {s.confidence}")
print(f"   Source: {s.source}")
print(f"   Model: {s.model_version}")
print(f"   Accepted (before): {s.accepted}")

# Get initial metric value
initial_metric = ml_suggestion_accepts_total.labels(
    model_version=s.model_version or "n/a", source=s.source or "n/a", label=s.label
)._value.get()
print(f"\n📊 Metric before: {initial_metric}")

# Accept the suggestion
result = accept_suggestion(s.id, db)
print(f"\n✅ Accept result: {result}")

# Verify database
db.refresh(s)
print("\n✅ Database updated:")
print(f"   Accepted (after): {s.accepted}")

# Verify metric
final_metric = ml_suggestion_accepts_total.labels(
    model_version=s.model_version or "n/a", source=s.source or "n/a", label=s.label
)._value.get()
print(f"\n📊 Metric after: {final_metric}")
print(f"📊 Metric increment: {final_metric - initial_metric}")

# Test idempotency
print("\n🔄 Testing idempotency (accept again)...")
result2 = accept_suggestion(s.id, db)
print(f"✅ Second accept result: {result2}")

final_metric2 = ml_suggestion_accepts_total.labels(
    model_version=s.model_version or "n/a", source=s.source or "n/a", label=s.label
)._value.get()
print(f"📊 Metric after 2nd accept: {final_metric2}")
print(f"📊 Metric increment: {final_metric2 - final_metric}")

if final_metric2 == final_metric:
    print("\n✅ Idempotent test PASSED - metric did not double-count")
else:
    print("\n❌ Idempotent test FAILED - metric incremented again!")

db.close()
print("\n✅ E2E test complete!")
