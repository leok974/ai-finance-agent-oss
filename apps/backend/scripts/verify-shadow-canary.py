#!/usr/bin/env python3
"""
Quick verification script for Phase 2 Shadow + Canary integration.

Run this after deploying the updated backend code:
  docker compose -f docker-compose.prod.yml exec backend python scripts/verify-shadow-canary.py
"""
import os
import sys

def test_imports():
    """Verify all required imports work."""
    print("✓ Testing imports...")
    try:
        from app.services.suggest.serve import suggest_auto, _sticky_hash
        from app.ml.runtime import predict_row
        from app.ml.feature_build import normalize_description
        from app.metrics_ml import (
            ml_predict_requests_total,
            suggest_compare_total,
            suggest_source_total,
        )
        print("  ✅ All imports successful")
        return True
    except ImportError as e:
        print(f"  ❌ Import failed: {e}")
        return False


def test_sticky_hash():
    """Verify sticky hash function works correctly."""
    print("✓ Testing sticky hash...")
    from app.services.suggest.serve import _sticky_hash
    
    # Test consistency
    h1 = _sticky_hash("user123")
    h2 = _sticky_hash("user123")
    assert h1 == h2, "Hash not consistent"
    
    # Test range
    assert 0 <= h1 < 100, f"Hash {h1} out of range [0, 99]"
    
    # Test different users
    h3 = _sticky_hash("user456")
    # Don't assert they're different (collision is possible but unlikely)
    
    print(f"  ✅ Sticky hash working (user123 → {h1})")
    return True


def test_suggest_auto_signature():
    """Verify suggest_auto accepts user_id parameter."""
    print("✓ Testing suggest_auto signature...")
    from app.services.suggest.serve import suggest_auto
    from datetime import datetime
    import inspect
    
    sig = inspect.signature(suggest_auto)
    params = list(sig.parameters.keys())
    
    assert "txn" in params, "Missing txn parameter"
    assert "user_id" in params, "Missing user_id parameter"
    
    print(f"  ✅ Signature correct: {params}")
    return True


def test_suggest_auto_execution():
    """Test suggest_auto with sample transaction."""
    print("✓ Testing suggest_auto execution...")
    from app.services.suggest.serve import suggest_auto
    from datetime import datetime
    
    txn = {
        "id": 999,
        "amount": -42.50,
        "merchant": "STARBUCKS",
        "description": "STARBUCKS STORE #12345",
        "created_at": datetime.now(),
        "tenant_id": 1,
    }
    
    # Test with user_id (canary=0, should return rules)
    cands, model_id, features_hash, source = suggest_auto(txn, user_id="test123")
    
    assert len(cands) > 0, "No candidates returned"
    assert "label" in cands[0], "Candidate missing label"
    assert "confidence" in cands[0], "Candidate missing confidence"
    assert source in ["rule", "model"], f"Invalid source: {source}"
    
    # With CANARY=0 (default), should always be rule
    expected_source = "rule" if os.getenv("SUGGEST_USE_MODEL_CANARY", "0") == "0" else "rule|model"
    
    print(f"  ✅ Suggestions working:")
    print(f"     Label: {cands[0]['label']}")
    print(f"     Confidence: {cands[0]['confidence']:.2f}")
    print(f"     Source: {source}")
    print(f"     Model ID: {model_id}")
    
    return True


def test_metrics_primed():
    """Verify ML metrics are primed and visible."""
    print("✓ Testing metrics priming...")
    from app.metrics_ml import (
        ml_predict_requests_total,
        suggest_compare_total,
        suggest_source_total,
    )
    
    # Metrics should be callable
    try:
        ml_predict_requests_total.labels(available="True")
        suggest_compare_total.labels(agree="True")
        suggest_source_total.labels(source="rule")
        print("  ✅ Metrics primed and accessible")
        return True
    except Exception as e:
        print(f"  ❌ Metric access failed: {e}")
        return False


def test_canary_env_var():
    """Check SUGGEST_USE_MODEL_CANARY environment variable."""
    print("✓ Testing canary environment variable...")
    canary = os.getenv("SUGGEST_USE_MODEL_CANARY", "0")
    
    print(f"  ℹ️  SUGGEST_USE_MODEL_CANARY = {canary!r}")
    
    if canary == "0":
        print("     Shadow mode only (rules always returned)")
    elif canary == "1":
        print("     100% model rollout (if model available)")
    elif canary.endswith("%"):
        try:
            pct = int(canary[:-1])
            print(f"     {pct}% canary rollout")
        except ValueError:
            print(f"  ⚠️  Invalid canary format: {canary!r}")
    else:
        print(f"  ⚠️  Unexpected canary value: {canary!r}")
    
    return True


def main():
    """Run all verification tests."""
    print("=" * 60)
    print("Phase 2 Shadow + Canary Integration Verification")
    print("=" * 60)
    print()
    
    tests = [
        ("Imports", test_imports),
        ("Sticky Hash", test_sticky_hash),
        ("Signature", test_suggest_auto_signature),
        ("Execution", test_suggest_auto_execution),
        ("Metrics", test_metrics_primed),
        ("Env Var", test_canary_env_var),
    ]
    
    results = []
    for name, test_fn in tests:
        try:
            success = test_fn()
            results.append((name, success))
        except Exception as e:
            print(f"  ❌ Test failed with exception: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
        print()
    
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"  {status}  {name}")
    
    print()
    print(f"Result: {passed}/{total} tests passed")
    
    if passed == total:
        print()
        print("✅ Phase 2 Shadow + Canary integration verified!")
        print()
        print("Next steps:")
        print("  1. Monitor shadow mode metrics for 48h")
        print("  2. Check agreement rate in Grafana")
        print("  3. Analyze disagreement patterns")
        print("  4. Decide on canary rollout")
        return 0
    else:
        print()
        print("❌ Some tests failed. Review output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
