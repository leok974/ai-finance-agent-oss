# ML Training Architecture - Decoupled from Transaction Lifecycle

## Problem Statement

When users click "Reset" to clear their transaction data, we need to preserve:
- ✅ **Rules** (user-created categorization rules)
- ✅ **Feedback** (ML training signals: accept/reject/correct decisions)
- ✅ **Learning history** (model improvements over time)

**Without this**, every Reset would wipe the "brain" of the system, forcing the ML model to start from scratch.

---

## Architecture Overview

### What Gets Wiped on Reset (`replace=true`)
- ❌ `transactions` - Raw financial facts (ephemeral)
- ❌ `month_aggregates` - Derived caches (if any)
- ❌ In-memory state (`app.state.txns`)

### What Survives (ML Training Assets)
- ✅ `rules` - User-created mapping rules
- ✅ `feedback` - Click stream of user decisions
- ✅ `rule_suggestions` - Mined patterns
- ✅ `budgets` - User preferences
- ✅ Future: `model_state`, `merchant_overrides`

---

## Database Schema Changes

### Before (Problem)
```python
class Feedback(Base):
    txn_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    # ❌ CASCADE DELETE: When transaction deleted, feedback deleted
```

**Issue**: `DELETE FROM transactions` cascades to `feedback`, losing training data.

### After (Solution)
```python
class Feedback(Base):
    # Weak reference - transaction may be deleted
    txn_id = Column(Integer, nullable=True, index=True)  # NO FK constraint

    # Direct merchant storage - feedback works without transaction
    merchant = Column(String(256), nullable=True, index=True)

    # User's ground truth label
    label = Column(String(128), nullable=False, index=True)

    # Model prediction (for accuracy tracking)
    model_pred = Column(String(128), nullable=True)

    # Decision type: 'accept' | 'correct' | 'reject' | 'apply_rule'
    decision = Column(String(32), default='correct')

    # Weight for importance sampling
    weight = Column(Float, default=1.0)

    # Month for time-based analytics
    month = Column(String(7), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

**Key Changes**:
1. **No FK constraint** - Feedback is an event, not a dependent fact
2. **Denormalized merchant** - Feedback self-sufficient
3. **Rich metadata** - Track decision type, model accuracy, weights

---

## Migration Path

### Step 1: Database Migration
```bash
# Apply migration
cd apps/backend
alembic upgrade head

# This will:
# 1. Drop feedback.txn_id FK constraint
# 2. Make txn_id nullable
# 3. Add merchant, model_pred, decision, weight, month columns
# 4. Backfill merchant from existing transactions
# 5. Create indexes for fast lookups
```

### Step 2: Code Changes

#### Updated Ingest Endpoint
```python
# apps/backend/app/routers/ingest.py

if replace:
    # ONLY delete transactions - preserve ML assets
    db.query(Transaction).delete()  # feedback survives!
    db.commit()
```

#### Updated ORM Models
```python
# apps/backend/app/orm_models.py

class Transaction:
    # Remove cascade relationship
    # feedbacks: Mapped[list["Feedback"]] = relationship(..., cascade="all, delete-orphan")
    pass  # NO relationship - fully decoupled

class Feedback:
    txn_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Weak ref
    merchant: Mapped[str | None] = mapped_column(String(256), index=True)
    # ... additional fields
```

---

## How Training Works After Reset

### Scenario: User Clears All Data
```
1. User clicks Reset
   → DELETE FROM transactions  (feedback remains)

2. Feedback table still contains:
   - merchant="Whole Foods" → label="Groceries" (decision=accept, weight=1.0)
   - merchant="Delta"       → label="Travel"    (decision=correct, weight=1.0)
   - merchant="Starbucks"   → label="Coffee"    (decision=accept, weight=1.0)

3. User uploads new CSV
   → Model still knows: "Whole Foods" → "Groceries"
   → Zero-shot categorization works immediately!
```

### Training Loop (Incremental)
```python
# Simplified trainer (frequency-based Naive Bayes)

def train_from_feedback(db: Session) -> ModelState:
    """Train classifier from feedback events (ignores deleted txns)."""

    # Fetch all feedback (regardless of txn_id existence)
    events = db.query(Feedback).filter(
        Feedback.decision.in_(['accept', 'correct'])
    ).all()

    # Token counts: token → category → count
    counts = defaultdict(lambda: defaultdict(float))
    priors = defaultdict(float)

    for fb in events:
        if not fb.merchant:
            continue

        tokens = tokenize(fb.merchant)  # ['whole', 'foods']
        for token in tokens:
            counts[token][fb.label] += fb.weight
        priors[fb.label] += fb.weight

    return ModelState(counts=counts, priors=priors)

def predict(model: ModelState, merchant: str) -> str:
    """Predict category using trained model."""
    tokens = tokenize(merchant)
    scores = defaultdict(float)

    for token in tokens:
        for category, count in model.counts[token].items():
            # Add-one smoothing
            scores[category] += log((count + 1) / (sum(model.counts[token].values()) + len(model.priors)))

    for category, prior in model.priors.items():
        scores[category] += log((prior + 1) / sum(model.priors.values()))

    return max(scores, key=scores.get)
```

---

## UI Integration (No UX Changes)

### Capture Feedback Automatically

#### 1. User Accepts Suggestion
```typescript
// apps/web/src/lib/api.ts

export async function acceptSuggestion(txnId: number, category: string) {
  await fetchJSON('/agent/ml/feedback', {
    method: 'POST',
    body: JSON.stringify({
      txn_id: txnId,
      merchant: '...', // from txn
      model_pred: category,
      user_label: category,
      decision: 'accept',
      weight: 1.0,
      source: 'ui'
    })
  });
}
```

#### 2. User Corrects Category
```typescript
export async function updateCategory(txnId: number, oldCat: string, newCat: string) {
  await fetchJSON('/agent/ml/feedback', {
    method: 'POST',
    body: JSON.stringify({
      txn_id: txnId,
      merchant: '...',
      model_pred: oldCat,
      user_label: newCat,
      decision: 'correct',
      weight: 1.0,
      source: 'ui'
    })
  });
}
```

#### 3. User Applies Rule
```typescript
export async function applyRule(ruleId: number, affectedTxns: number[]) {
  for (const txnId of affectedTxns) {
    await fetchJSON('/agent/ml/feedback', {
      method: 'POST',
      body: JSON.stringify({
        txn_id: txnId,
        merchant: '...',
        model_pred: null,
        user_label: rule.category,
        decision: 'apply_rule',
        weight: 0.8,  // Slightly lower weight (bulk action)
        source: 'rule_apply'
      })
    });
  }
}
```

---

## API Endpoints

### POST /agent/ml/feedback
```python
@router.post("/feedback")
def log_feedback(body: FeedbackBody, db: Session):
    """
    Log ML training event.

    Body:
    {
      "txn_id": 123,           // Optional (may reference deleted txn)
      "merchant": "Whole Foods",
      "model_pred": "Shopping",
      "user_label": "Groceries",
      "decision": "correct",   // accept | correct | reject | apply_rule
      "weight": 1.0,
      "month": "2025-08",
      "source": "ui"
    }
    """
    fb = Feedback(**body.dict())
    db.add(fb)
    db.commit()
    return {"ok": True}
```

### POST /agent/ml/train
```python
@router.post("/train")
def trigger_training(db: Session):
    """
    Trigger incremental model training from feedback.
    Persists model_state to database.
    """
    model = train_from_feedback(db)

    # Serialize model state
    blob = pickle.dumps(model)

    # Upsert model_state
    db.merge(ModelState(name="cat_classifier:v1", blob=blob))
    db.commit()

    return {
        "ok": True,
        "feedback_count": db.query(Feedback).count(),
        "categories": len(model.priors),
        "updated_at": datetime.now().isoformat()
    }
```

### GET /agent/ml/status
```python
@router.get("/status")
def ml_status(db: Session):
    """
    Return ML system health metrics.
    """
    return {
        "feedback_events": db.query(Feedback).count(),
        "rules": db.query(Rule).filter(Rule.active == True).count(),
        "model_name": "cat_classifier:v1",
        "updated_at": db.query(ModelState).filter(
            ModelState.name == "cat_classifier:v1"
        ).first().updated_at.isoformat()
    }
```

---

## Testing Strategy

### 1. Unit Test: Feedback Survives Reset
```python
def test_feedback_survives_reset(db: Session):
    # Create transaction + feedback
    txn = Transaction(date=date(2025, 8, 1), merchant="Whole Foods", amount=-50, month="2025-08")
    db.add(txn)
    db.commit()

    fb = Feedback(txn_id=txn.id, merchant="Whole Foods", label="Groceries", decision="accept")
    db.add(fb)
    db.commit()

    # Reset: delete all transactions
    db.query(Transaction).delete()
    db.commit()

    # Verify feedback still exists
    assert db.query(Feedback).count() == 1
    assert db.query(Feedback).first().merchant == "Whole Foods"
```

### 2. Integration Test: Model Learns Across Resets
```python
def test_model_learns_across_resets(db: Session):
    # Train model with feedback
    fb1 = Feedback(merchant="Starbucks", label="Coffee", decision="accept")
    fb2 = Feedback(merchant="Whole Foods", label="Groceries", decision="correct")
    db.add_all([fb1, fb2])
    db.commit()

    model = train_from_feedback(db)

    # User resets data
    db.query(Transaction).delete()
    db.commit()

    # Upload new transactions
    new_txn = Transaction(date=date(2025, 9, 1), merchant="Starbucks", amount=-5, month="2025-09")
    db.add(new_txn)
    db.commit()

    # Model still predicts correctly
    pred = predict(model, "Starbucks")
    assert pred == "Coffee"
```

### 3. E2E Test: Reset Button Preserves Learning
```typescript
test('reset button preserves ML training', async ({ page }) => {
  // Upload CSV with 10 transactions
  await uploadCsv(page, 'test_data.csv');

  // Accept a suggestion
  await page.click('button:has-text("Accept") >> nth=0');

  // Click Reset
  await page.click('button:has-text("Reset")');
  await expect(page.getByText('All data cleared')).toBeVisible();

  // Verify database
  const txnCount = await queryDB('SELECT COUNT(*) FROM transactions');
  const feedbackCount = await queryDB('SELECT COUNT(*) FROM feedback');

  expect(txnCount).toBe(0);  // Transactions deleted
  expect(feedbackCount).toBe(1);  // Feedback preserved!

  // Re-upload same CSV
  await uploadCsv(page, 'test_data.csv');

  // Model should auto-categorize based on previous feedback
  const categorized = await queryDB('SELECT COUNT(*) FROM transactions WHERE category IS NOT NULL');
  expect(categorized).toBeGreaterThan(0);
});
```

---

## Deployment Checklist

### Pre-Deployment
- [x] Create migration: `20251103_preserve_ml.py`
- [ ] Review migration SQL (dry run)
- [ ] Backup production database
- [ ] Test migration on staging

### Deployment Steps
1. **Backup Database**
   ```bash
   docker exec ai-finance-agent-oss-clean-postgres-1 \
     pg_dump -U myuser finance > backup_$(date +%Y%m%d).sql
   ```

2. **Apply Migration**
   ```bash
   cd apps/backend
   alembic upgrade head
   ```

3. **Verify Schema**
   ```sql
   \d feedback  -- Check columns
   \d+ feedback  -- Check indexes
   SELECT constraint_name FROM information_schema.table_constraints
   WHERE table_name='feedback' AND constraint_type='FOREIGN KEY';  -- Should be empty
   ```

4. **Test Reset Function**
   ```bash
   # Test in browser
   # 1. Upload CSV
   # 2. Click Reset
   # 3. Verify feedback count: SELECT COUNT(*) FROM feedback;
   # 4. Re-upload CSV
   # 5. Verify categorization works
   ```

### Post-Deployment
- [ ] Monitor feedback table growth
- [ ] Check model prediction accuracy
- [ ] Verify no cascade deletes on feedback
- [ ] Test incremental training endpoint

---

## Future Enhancements

### 1. Merchant Overrides Table
```python
class MerchantOverride(Base):
    """
    Stable merchant → category mappings (like a growing label set).
    Checked before model prediction.
    """
    __tablename__ = "merchant_overrides"

    merchant_norm = Column(String, primary_key=True)  # Canonicalized
    category = Column(String, nullable=False)
    confidence = Column(Float, default=0.9)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

### 2. Model State Persistence
```python
class ModelState(Base):
    """
    Opaque blob storage for trained model weights.
    Enables incremental training and versioning.
    """
    __tablename__ = "model_state"

    name = Column(String, primary_key=True)  # 'cat_classifier:v1'
    blob = Column(LargeBinary)  # Pickled or JSON
    updated_at = Column(DateTime, server_default=func.now())
```

### 3. Feature Statistics
```python
class FeatureStats(Base):
    """
    Global token/feature counts for TF-IDF or chi-square feature selection.
    """
    __tablename__ = "feature_stats"

    token = Column(String, primary_key=True)
    doc_count = Column(Integer, default=0)  # How many merchants contain this token
    total_count = Column(Integer, default=0)  # Total occurrences
    last_seen = Column(DateTime, server_default=func.now())
```

---

## Performance Considerations

### Feedback Table Growth
- **Expected growth**: ~10-50 events per user per month
- **Storage**: ~200 bytes per row
- **Index overhead**: Minimal (3 indexes: merchant, label, created_at)
- **Cleanup strategy**: Archive events older than 2 years

### Query Optimization
```sql
-- Fast: Get recent feedback for training
SELECT merchant, label, weight
FROM feedback
WHERE decision IN ('accept', 'correct')
AND created_at > NOW() - INTERVAL '1 year'
ORDER BY created_at DESC;

-- Fast: Count feedback by category
SELECT label, COUNT(*), SUM(weight)
FROM feedback
GROUP BY label;
```

### Training Performance
- **Naive Bayes**: ~10ms for 1000 feedback events
- **Memory**: ~1MB for 10K unique tokens
- **Retraining frequency**: Nightly or every 100 events

---

## Summary

**✅ Benefits**:
- ML model survives Reset (continuous learning)
- Zero-shot categorization after Reset
- Explainable predictions (token-based)
- Incremental training (no full retraining)
- Privacy-preserving (no external API calls)

**⚠️ Trade-offs**:
- Feedback table grows indefinitely (archive old events)
- Nullable txn_id (weak reference, no cascades)
- Denormalized merchant (slight storage overhead)

**🎯 Result**: Users can freely Reset transaction data without losing the system's "memory" of their categorization preferences.

---

**Last Updated**: 2025-11-03
**Status**: ✅ Architecture Defined, Migration Ready
**Next Steps**: Apply migration → Test Reset → Deploy
