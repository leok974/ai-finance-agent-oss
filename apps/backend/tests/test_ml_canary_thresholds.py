"""Tests for ML canary thresholds and fallback behavior."""
import pytest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app import config
from app.services.suggest.serve import suggest_auto


@pytest.fixture(autouse=True)
def _canary_env(monkeypatch):
    """Set up canary environment for tests."""
    monkeypatch.setattr(config, "SUGGEST_ENABLE_SHADOW", True, raising=False)
    monkeypatch.setattr(config, "SUGGEST_USE_MODEL_CANARY", "100", raising=False)
    monkeypatch.setattr(
        config,
        "SUGGEST_THRESHOLDS",
        {"Groceries": 0.90, "Dining": 0.75, "Shopping": 0.65},
        raising=False,
    )


def _mock_txn():
    """Create a mock transaction object."""
    return {
        "id": 123,
        "amount": -25.0,
        "merchant": "HARRIS TEETER",
        "description": "Harris Teeter 0085",
        "channel": "pos",
        "is_subscription": False,
        "created_at": None,
        "date": None,
    }


def test_low_confidence_falls_back_to_rules(monkeypatch):
    """Test that predictions below threshold fall back to rules."""
    # Mock model to return low confidence for Groceries
    def fake_predict(_row):
        return {
            "available": True,
            "label": "Groceries",
            "confidence": 0.60,  # Below 0.90 threshold
            "probs": {"Groceries": 0.60, "Dining": 0.30, "Shopping": 0.10},
            "model_meta": {"run_id": "test123", "val_f1_macro": 0.75},
        }

    with patch("app.services.suggest.serve.ml_predict_row", side_effect=fake_predict):
        with patch(
            "app.services.suggest.serve.suggest_for_txn",
            return_value=[{"label": "Groceries", "confidence": 0.95, "reasons": ["rule:merchant"]}],
        ):
            candidates, model_id, features_hash, source = suggest_auto(
                _mock_txn(), user_id="test_user"
            )

    assert source == "rule", "Should fall back to rules due to low confidence"
    assert model_id == "heuristic@v1"


def test_high_confidence_accepts_model(monkeypatch):
    """Test that predictions above threshold use model."""
    # Mock model to return high confidence for Groceries
    def fake_predict(_row):
        return {
            "available": True,
            "label": "Groceries",
            "confidence": 0.95,  # Above 0.90 threshold
            "probs": {"Groceries": 0.95, "Dining": 0.03, "Shopping": 0.02},
            "model_meta": {"run_id": "test123", "val_f1_macro": 0.78},
        }

    with patch("app.services.suggest.serve.ml_predict_row", side_effect=fake_predict):
        with patch(
            "app.services.suggest.serve.suggest_for_txn",
            return_value=[{"label": "Dining", "confidence": 0.85, "reasons": ["rule:keyword"]}],
        ):
            candidates, model_id, features_hash, source = suggest_auto(
                _mock_txn(), user_id="test_user"
            )

    assert source == "model", "Should use model due to high confidence"
    assert "lgbm@test123" in model_id
    assert candidates[0]["label"] == "Groceries"
    assert candidates[0]["confidence"] == 0.95


def test_per_class_threshold_variation(monkeypatch):
    """Test that different classes have different thresholds."""
    # Shopping has lower threshold (0.65) than Groceries (0.90)
    def fake_predict(_row):
        return {
            "available": True,
            "label": "Shopping",
            "confidence": 0.70,  # Above Shopping threshold (0.65), below Groceries (0.90)
            "probs": {"Shopping": 0.70, "Groceries": 0.20, "Dining": 0.10},
            "model_meta": {"run_id": "test456", "val_f1_macro": 0.76},
        }

    with patch("app.services.suggest.serve.ml_predict_row", side_effect=fake_predict):
        with patch(
            "app.services.suggest.serve.suggest_for_txn",
            return_value=[{"label": "Shopping", "confidence": 0.90, "reasons": ["rule:category"]}],
        ):
            candidates, model_id, features_hash, source = suggest_auto(
                _mock_txn(), user_id="test_user"
            )

    assert source == "model", "Should use model for Shopping with 0.70 confidence"
    assert candidates[0]["label"] == "Shopping"


def test_model_unavailable_falls_back(monkeypatch):
    """Test fallback when model is unavailable."""
    # Mock model as unavailable
    def fake_predict(_row):
        return {"available": False, "reason": "no_model"}

    with patch("app.services.suggest.serve.ml_predict_row", side_effect=fake_predict):
        with patch(
            "app.services.suggest.serve.suggest_for_txn",
            return_value=[{"label": "Transport", "confidence": 0.88, "reasons": ["rule:mcc"]}],
        ):
            candidates, model_id, features_hash, source = suggest_auto(
                _mock_txn(), user_id="test_user"
            )

    assert source == "rule", "Should fall back to rules when model unavailable"
    assert model_id == "heuristic@v1"


def test_canary_zero_percent_always_rules(monkeypatch):
    """Test that 0% canary always uses rules."""
    monkeypatch.setattr(config, "SUGGEST_USE_MODEL_CANARY", "0", raising=False)

    def fake_predict(_row):
        return {
            "available": True,
            "label": "Dining",
            "confidence": 0.99,  # Very high confidence
            "probs": {"Dining": 0.99, "Groceries": 0.01},
            "model_meta": {"run_id": "test789", "val_f1_macro": 0.82},
        }

    with patch("app.services.suggest.serve.ml_predict_row", side_effect=fake_predict):
        with patch(
            "app.services.suggest.serve.suggest_for_txn",
            return_value=[{"label": "Dining", "confidence": 0.85, "reasons": ["rule:merchant"]}],
        ):
            candidates, model_id, features_hash, source = suggest_auto(
                _mock_txn(), user_id="test_user"
            )

    assert source == "rule", "Should use rules when canary is 0%"
    assert model_id == "heuristic@v1"
