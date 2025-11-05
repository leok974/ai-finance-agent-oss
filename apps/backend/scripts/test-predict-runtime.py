#!/usr/bin/env python3
"""
Standalone verification for predict_row unit tests (no pytest needed).
Run inside the backend container to verify the tests would pass.
"""
import sys
from typing import Dict, Any


def clear_cache():
    """Clear the LRU cache."""
    from app.ml.runtime import _load_latest
    _load_latest.cache_clear()


def test_predict_row_happy_path():
    """Test predict_row when model is available."""
    print("\n✓ Testing predict_row happy path...")
    from app.ml.runtime import predict_row, _load_latest
    
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
    
    fake_meta = {
        "run_id": "run_UnitTest1234",
        "val_f1_macro": 0.80,
        "class_count": 10,
    }
    
    # Monkeypatch _load_latest
    import app.ml.runtime as runtime_module
    original_loader = runtime_module._load_latest
    
    def fake_loader():
        return FakeModel(), fake_meta
    
    runtime_module._load_latest = fake_loader
    runtime_module._load_latest.cache_clear = lambda: None  # Mock cache_clear
    
    try:
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
        
        out = predict_row(row)
        
        assert out["available"] is True, "Model should be available"
        assert out["label"] == "Groceries", f"Expected Groceries, got {out['label']}"
        assert out["confidence"] == 0.91, f"Expected 0.91, got {out['confidence']}"
        assert out["model_meta"]["run_id"] == "run_UnitTest1234"
        assert out["model_meta"]["val_f1_macro"] == 0.80
        
        print("  ✅ PASS: Happy path test")
        return True
    finally:
        runtime_module._load_latest = original_loader
        clear_cache()


def test_predict_row_no_model():
    """Test predict_row when no model is deployed."""
    print("\n✓ Testing predict_row with no model...")
    from app.ml.runtime import predict_row
    import app.ml.runtime as runtime_module
    
    # Monkeypatch to return None
    original_loader = runtime_module._load_latest
    
    def fake_loader_none():
        return None, None
    
    runtime_module._load_latest = fake_loader_none
    runtime_module._load_latest.cache_clear = lambda: None
    
    try:
        out = predict_row({
            "abs_amount": 20.0,
            "merchant": "UNKNOWN",
            "norm_desc": "foo"
        })
        
        assert out["available"] is False, "Model should not be available"
        assert out["reason"] == "no_model", f"Expected no_model, got {out.get('reason')}"
        assert "label" not in out, "Should not have label when model unavailable"
        
        print("  ✅ PASS: No model test")
        return True
    finally:
        runtime_module._load_latest = original_loader
        clear_cache()


def test_predict_row_alternative_merchant():
    """Test with different merchant."""
    print("\n✓ Testing predict_row with alternative merchant...")
    from app.ml.runtime import predict_row
    import app.ml.runtime as runtime_module
    
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
    
    original_loader = runtime_module._load_latest
    
    def fake_loader2():
        return FakeModel(), {"run_id": "test"}
    
    runtime_module._load_latest = fake_loader2
    runtime_module._load_latest.cache_clear = lambda: None
    
    try:
        row = {
            "abs_amount": 42.50,
            "merchant": "STARBUCKS",
            "norm_desc": "coffee",
        }
        
        out = predict_row(row)
        
        assert out["available"] is True
        assert out["label"] == "Dining", f"Expected Dining, got {out['label']}"
        assert out["confidence"] == 0.77
        
        print("  ✅ PASS: Alternative merchant test")
        return True
    finally:
        runtime_module._load_latest = original_loader
        clear_cache()


def main():
    """Run all tests."""
    print("=" * 60)
    print("ML Runtime Unit Tests (Standalone)")
    print("=" * 60)
    
    tests = [
        ("Happy Path", test_predict_row_happy_path),
        ("No Model", test_predict_row_no_model),
        ("Alternative Merchant", test_predict_row_alternative_merchant),
    ]
    
    results = []
    for name, test_fn in tests:
        try:
            success = test_fn()
            results.append((name, True))
        except AssertionError as e:
            print(f"  ❌ FAIL: {e}")
            results.append((name, False))
        except Exception as e:
            print(f"  ❌ ERROR: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"  {status}  {name}")
    
    print(f"\nResult: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✅ All tests passed!")
        return 0
    else:
        print("\n❌ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
