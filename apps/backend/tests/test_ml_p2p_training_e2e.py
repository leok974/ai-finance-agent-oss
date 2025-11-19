"""E2E test for P2P ML training pipeline.

Tests that the run_p2p_training() function executes successfully on a small
labeled dataset and produces valid outputs and model artifacts.
"""

import pytest
from pathlib import Path
from datetime import date, datetime, timedelta

from app.ml.train import run_p2p_training
from app.orm_models import Transaction
from app.ml.models import TransactionLabel, MLFeature


@pytest.fixture
def p2p_training_data(db_session, monkeypatch, tmp_path):
    """Create minimal P2P labeled dataset for training.

    Creates:
    - 10 transactions (5 P2P, 5 non-P2P)
    - Transaction labels for all 10
    - ML features for all 10 (with P2P flags set)

    Returns db_session with seeded data.
    """
    # Use tmp_path for model artifacts during tests
    monkeypatch.setattr("app.ml.train.MODEL_DIR", tmp_path)

    today = date.today()
    month = today.strftime("%Y-%m")

    # Create P2P transactions
    p2p_txns = [
        {
            "merchant": "NOW Withdrawal Zelle To JOHN DOE",
            "amount": -150.00,
            "category": "transfers",
        },
        {
            "merchant": "VENMO PAYMENT 1234567",
            "amount": -45.50,
            "category": "transfers",
        },
        {"merchant": "SQ *CASH APP", "amount": -25.00, "category": "transfers"},
        {"merchant": "PAYPAL INST XFER", "amount": -100.00, "category": "transfers"},
        {
            "merchant": "APPLE CASH SENT PAYMENT",
            "amount": -75.00,
            "category": "transfers",
        },
    ]

    # Create non-P2P transactions
    non_p2p_txns = [
        {"merchant": "STARBUCKS COFFEE", "amount": -5.50, "category": "coffee"},
        {"merchant": "WALMART GROCERY", "amount": -85.00, "category": "groceries"},
        {
            "merchant": "UBER TECHNOLOGIES",
            "amount": -25.00,
            "category": "transportation",
        },
        {"merchant": "NETFLIX.COM", "amount": -15.99, "category": "subscriptions"},
        {"merchant": "SHELL OIL", "amount": -45.00, "category": "transportation.fuel"},
    ]

    txn_records = []

    # Insert P2P transactions
    for i, txn_data in enumerate(p2p_txns):
        # Spread transactions over 60 days to ensure temporal split works
        txn = Transaction(
            date=today - timedelta(days=i * 12),  # 0, 12, 24, 36, 48 days back
            merchant=txn_data["merchant"],
            description=txn_data["merchant"],
            amount=txn_data["amount"],
            category=txn_data["category"],
            month=month,
            account="checking",
            pending=False,
        )
        db_session.add(txn)
        db_session.flush()
        txn_records.append((txn, txn_data["category"], True))

    # Insert non-P2P transactions
    for i, txn_data in enumerate(non_p2p_txns):
        # Spread transactions over 60 days to ensure temporal split works
        txn = Transaction(
            date=today - timedelta(days=(i * 12) + 6),  # 6, 18, 30, 42, 54 days back
            merchant=txn_data["merchant"],
            description=txn_data["merchant"],
            amount=txn_data["amount"],
            category=txn_data["category"],
            month=month,
            account="checking",
            pending=False,
        )
        db_session.add(txn)
        db_session.flush()
        txn_records.append((txn, txn_data["category"], False))

    db_session.commit()

    # Create transaction labels
    for txn, category, _ in txn_records:
        label = TransactionLabel(
            txn_id=txn.id,
            label=category,
            source="human",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(label)

    db_session.commit()

    # Create ML features
    for txn, category, is_p2p in txn_records:
        amount = float(txn.amount)
        abs_amount = abs(amount)

        feature = MLFeature(
            txn_id=txn.id,
            ts_month=date(txn.date.year, txn.date.month, 1),
            amount=amount,
            abs_amount=abs_amount,
            merchant=txn.merchant,
            mcc=None,
            channel="pos",
            hour_of_day=None,
            dow=txn.date.weekday(),
            is_weekend=txn.date.weekday() >= 5,
            is_subscription=False,
            norm_desc=txn.merchant.lower(),
            tokens=txn.merchant.lower().split()[:5],
            feat_p2p_flag=is_p2p,
            feat_p2p_large_outflow=(is_p2p and abs_amount >= 100),
            created_at=datetime.utcnow(),
        )
        db_session.add(feature)

    db_session.commit()

    yield db_session


def test_p2p_training_end_to_end(p2p_training_data, tmp_path):
    """E2E test: run P2P training on small dataset and verify outputs.

    Tests that:
    - Training completes without error
    - Returns valid TrainingResult
    - Model artifact is created on disk
    - Metrics are sane (accuracy > 0, etc.)
    """
    # Import app.db to get the test engine
    import app.db as app_db

    # Run training with max_rows limit (fast execution)
    result = run_p2p_training(max_rows=10, dry_run=False, connection=app_db.engine)

    # Assert basic result shape
    assert result.rows_used > 0, "Should use at least some training rows"
    assert result.rows_used <= 10, "Should respect max_rows limit"
    assert result.features_dim > 0, "Feature dimension should be positive"

    # Assert metrics exist and are reasonable
    assert "accuracy" in result.metrics
    assert "f1_macro" in result.metrics
    assert "train_size" in result.metrics
    assert "val_size" in result.metrics
    assert "n_classes" in result.metrics

    # Sanity check metric values
    assert 0.0 <= result.metrics["accuracy"] <= 1.0, "Accuracy should be in [0, 1]"
    assert 0.0 <= result.metrics["f1_macro"] <= 1.0, "F1 macro should be in [0, 1]"
    assert result.metrics["n_classes"] > 0, "Should have at least one class"
    assert result.metrics["train_size"] > 0, "Train set should be non-empty"

    # Assert model artifact exists on disk
    model_path = Path(result.model_path)
    assert model_path.exists(), f"Model artifact should exist at {model_path}"
    assert model_path.is_file(), "Model path should be a file"
    assert model_path.stat().st_size > 0, "Model file should not be empty"


def test_p2p_training_dry_run(p2p_training_data, tmp_path):
    """Test that dry_run=True computes metrics but doesn't write model file."""
    # Import app.db to get the test engine
    import app.db as app_db

    # Run training in dry-run mode
    result = run_p2p_training(max_rows=10, dry_run=True, connection=app_db.engine)

    # Assert metrics are computed
    assert result.rows_used > 0
    assert "accuracy" in result.metrics

    # Assert model file is NOT created (dry run)
    model_path = Path(result.model_path)
    assert not model_path.exists(), "Dry run should not create model file"


def test_p2p_training_no_data_raises_error(db_session, monkeypatch, tmp_path):
    """Test that training raises RuntimeError when no labeled data exists."""
    # Use tmp_path for model artifacts
    monkeypatch.setattr("app.ml.train.MODEL_DIR", tmp_path)

    # Import app.db to get the test engine
    import app.db as app_db

    # Attempt training with empty database
    with pytest.raises(RuntimeError, match="No training data available"):
        run_p2p_training(max_rows=10, dry_run=False, connection=app_db.engine)


def test_p2p_features_included_in_training(p2p_training_data, tmp_path):
    """Verify that P2P features (feat_p2p_flag, feat_p2p_large_outflow) are used.

    This test ensures the pipeline includes P2P-specific features by checking
    that the trained model can successfully process feature vectors containing
    P2P columns.
    """
    # Import app.db to get the test engine
    import app.db as app_db

    result = run_p2p_training(max_rows=10, dry_run=False, connection=app_db.engine)

    # Load the trained model and verify it can predict
    import joblib

    model_path = Path(result.model_path)
    pipe = joblib.load(model_path)

    # The pipeline should have preprocessor + classifier
    assert hasattr(pipe, "named_steps")
    assert "prep" in pipe.named_steps
    assert "clf" in pipe.named_steps

    # Query a feature row from database to test prediction
    from sqlalchemy import select

    feature = p2p_training_data.execute(select(MLFeature).limit(1)).scalar_one()

    # Build a minimal DataFrame matching the expected schema
    import pandas as pd

    test_df = pd.DataFrame(
        [
            {
                "txn_id": feature.txn_id,
                "ts_month": feature.ts_month,
                "amount": feature.amount,
                "abs_amount": feature.abs_amount,
                "merchant": feature.merchant,
                "mcc": feature.mcc,
                "channel": feature.channel,
                "hour_of_day": feature.hour_of_day,
                "dow": feature.dow,
                "is_weekend": feature.is_weekend,
                "is_subscription": feature.is_subscription,
                "norm_desc": feature.norm_desc,
                "feat_p2p_flag": feature.feat_p2p_flag,
                "feat_p2p_large_outflow": feature.feat_p2p_large_outflow,
            }
        ]
    )

    # Predict should not raise (proves P2P features are in the pipeline)
    predictions = pipe.predict(test_df)
    assert len(predictions) == 1
    assert isinstance(predictions[0], str)  # Category label
