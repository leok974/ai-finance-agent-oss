"""Unit tests for ML runtime predict_row() with mocked registry.

Tests the runtime layer by monkeypatching its private cache loader.
No real model files needed.
"""
import pytest


@pytest.fixture(autouse=True)
def clear_cache(monkeypatch):
    """Ensure the LRU cache is cleared each test."""
    from app.ml import runtime
    runtime._load_latest.cache_clear()
    yield
    runtime._load_latest.cache_clear()


def test_predict_row_happy_path(monkeypatch):
    """Test predict_row when model is available."""
    from app.ml import runtime

    class FakeModel:
        """Mock model that returns deterministic predictions."""
        def predict_one(self, row: dict):
            # Deterministic: merchant decides label
            merchant = (row.get("merchant") or "").upper()
            if merchant.startswith("HARRIS"):
                return {
                    "label": "Groceries",
                    "confidence": 0.91,
                    "probs": {"Groceries": 0.91, "Dining": 0.09}
                }
            return {
                "label": "Dining",
                "confidence": 0.77,
                "probs": {"Groceries": 0.23, "Dining": 0.77}
            }

    fake_meta = {
        "run_id": "run_UnitTest1234",
        "val_f1_macro": 0.80,
        "val_accuracy": 0.82,
        "class_count": 10,
    }

    def fake_loader():
        return FakeModel(), fake_meta

    monkeypatch.setattr(runtime, "_load_latest", fake_loader)

    # Test with HARRIS TEETER merchant
    row = {
        "abs_amount": 12.34,
        "merchant": "HARRIS TEETER",
        "channel": "pos",
        "hour_of_day": 18,
        "dow": 5,
        "is_weekend": True,
        "is_subscription": False,
        "norm_desc": "HARRIS TEETER 0085",
    }
    
    out = runtime.predict_row(row)
    
    # Assertions
    assert out["available"] is True
    assert out["label"] == "Groceries"
    assert 0.0 <= out["confidence"] <= 1.0
    assert out["confidence"] == 0.91
    
    # Check model metadata
    assert "model_meta" in out
    assert out["model_meta"]["run_id"] == "run_UnitTest1234"
    assert out["model_meta"]["val_f1_macro"] == 0.80
    assert out["model_meta"]["class_count"] == 10
    
    # Check probabilities
    assert "probs" in out
    assert out["probs"]["Groceries"] == 0.91
    assert out["probs"]["Dining"] == 0.09


def test_predict_row_alternative_merchant(monkeypatch):
    """Test predict_row with different merchant (should predict Dining)."""
    from app.ml import runtime

    class FakeModel:
        def predict_one(self, row: dict):
            merchant = (row.get("merchant") or "").upper()
            if merchant.startswith("HARRIS"):
                return {
                    "label": "Groceries",
                    "confidence": 0.91,
                    "probs": {"Groceries": 0.91, "Dining": 0.09}
                }
            return {
                "label": "Dining",
                "confidence": 0.77,
                "probs": {"Groceries": 0.23, "Dining": 0.77}
            }

    fake_meta = {"run_id": "run_Test2", "val_f1_macro": 0.75}

    def fake_loader():
        return FakeModel(), fake_meta

    monkeypatch.setattr(runtime, "_load_latest", fake_loader)

    row = {
        "abs_amount": 42.50,
        "merchant": "STARBUCKS",
        "channel": "pos",
        "hour_of_day": 8,
        "dow": 1,
        "is_weekend": False,
        "is_subscription": False,
        "norm_desc": "starbucks store 12345",
    }
    
    out = runtime.predict_row(row)
    
    assert out["available"] is True
    assert out["label"] == "Dining"
    assert out["confidence"] == 0.77


def test_predict_row_no_model(monkeypatch):
    """Test predict_row when no model is deployed (registry empty)."""
    from app.ml import runtime

    def fake_loader_none():
        """Return None to simulate no model available."""
        return None, None

    monkeypatch.setattr(runtime, "_load_latest", fake_loader_none)

    out = runtime.predict_row({
        "abs_amount": 20.0,
        "merchant": "UNKNOWN",
        "norm_desc": "foo"
    })
    
    # Should return unavailable status
    assert out["available"] is False
    assert out["reason"] == "no_model"
    
    # Should not have label or confidence
    assert "label" not in out
    assert "confidence" not in out


def test_predict_row_minimal_features(monkeypatch):
    """Test predict_row with minimal feature set."""
    from app.ml import runtime

    class FakeModel:
        def predict_one(self, row: dict):
            # Even with minimal features, should return prediction
            return {
                "label": "General",
                "confidence": 0.60,
                "probs": {"General": 0.60, "Other": 0.40}
            }

    fake_meta = {"run_id": "run_Minimal", "val_f1_macro": 0.70}

    def fake_loader():
        return FakeModel(), fake_meta

    monkeypatch.setattr(runtime, "_load_latest", fake_loader)

    # Minimal row with only required fields
    row = {
        "abs_amount": 10.0,
    }
    
    out = runtime.predict_row(row)
    
    assert out["available"] is True
    assert out["label"] == "General"
    assert out["confidence"] == 0.60


def test_predict_row_cache_hit(monkeypatch):
    """Test that _load_latest is cached (only called once)."""
    from app.ml import runtime

    load_count = {"count": 0}

    class FakeModel:
        def predict_one(self, row: dict):
            return {
                "label": "Test",
                "confidence": 0.5,
                "probs": {"Test": 0.5}
            }

    def fake_loader():
        load_count["count"] += 1
        return FakeModel(), {"run_id": "cached"}

    monkeypatch.setattr(runtime, "_load_latest", fake_loader)

    # First call should load model
    runtime.predict_row({"abs_amount": 10.0})
    assert load_count["count"] == 1

    # Second call should use cache (not increment count)
    runtime.predict_row({"abs_amount": 20.0})
    assert load_count["count"] == 1, "Model loader should be cached"
