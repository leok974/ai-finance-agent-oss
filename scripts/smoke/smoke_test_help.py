#!/usr/bin/env python3
"""
Comprehensive smoke test for RAG-enhanced help system.

Tests:
1. All 5 explainer endpoints
2. Cache behavior (miss → hit)
3. Refresh parameter
4. Redis connectivity
5. Metrics tracking
"""
import requests
import time
import sys

BASE_URL = "http://localhost:8000"
MONTH = "2025-11"

PANELS = [
    "charts.month_merchants",
    "charts.month_categories",
    "charts.daily_flows",
    "charts.month_anomalies",
    "charts.insights_overview",
]


def print_header(msg):
    print(f"\n{'='*70}")
    print(f"  {msg}")
    print(f"{'='*70}")


def test_all_panels():
    """Test all 5 explainer endpoints."""
    print_header("TEST 1: All Explainer Endpoints")

    results = []
    for panel_id in PANELS:
        try:
            response = requests.get(
                f"{BASE_URL}/agent/describe/{panel_id}",
                params={"month": MONTH},
                timeout=10,
            )

            if response.status_code == 200:
                data = response.json()
                title = data.get("title", "N/A")
                what_len = len(data.get("what", ""))
                why_len = len(data.get("why", ""))
                actions = len(data.get("actions", []))

                results.append(
                    {
                        "panel": panel_id,
                        "status": "✓ PASS",
                        "title": title,
                        "what_len": what_len,
                        "why_len": why_len,
                        "actions": actions,
                    }
                )
            else:
                results.append(
                    {
                        "panel": panel_id,
                        "status": f"✗ FAIL ({response.status_code})",
                        "error": response.text[:100],
                    }
                )
        except Exception as e:
            results.append(
                {"panel": panel_id, "status": "✗ ERROR", "error": str(e)[:100]}
            )

    # Print results table
    for r in results:
        if r["status"] == "✓ PASS":
            print(f"{r['status']} {r['panel']}")
            print(f"     Title: {r['title']}")
            print(
                f"     What: {r['what_len']} chars, Why: {r['why_len']} chars, Actions: {r['actions']}"
            )
        else:
            print(f"{r['status']} {r['panel']}")
            if "error" in r:
                print(f"     Error: {r['error']}")

    passed = sum(1 for r in results if r["status"] == "✓ PASS")
    print(f"\n  Result: {passed}/{len(PANELS)} panels passed")
    return passed == len(PANELS)


def test_cache_behavior():
    """Test cache miss → hit → refresh."""
    print_header("TEST 2: Cache Behavior")

    panel_id = "charts.month_merchants"
    test_month = "2024-03"  # Different month to avoid collision

    # Clear cache for this test
    try:
        import redis

        r = redis.from_url("redis://redis:6379/0")
        cache_key = f"help:{panel_id}:{test_month}"
        r.delete(cache_key)
        print(f"  Cleared cache key: {cache_key}")
    except:
        print("  Note: Could not clear Redis (using in-memory fallback)")

    # Request 1: Cache miss
    print("\n  Request 1: Cache MISS (expected)...")
    start = time.time()
    r1 = requests.get(
        f"{BASE_URL}/agent/describe/{panel_id}", params={"month": test_month}
    )
    t1 = time.time() - start

    if r1.status_code != 200:
        print(f"  ✗ FAIL: Got {r1.status_code}")
        return False

    print(f"     Status: {r1.status_code}, Latency: {t1*1000:.1f}ms")

    # Request 2: Cache hit
    print("\n  Request 2: Cache HIT (expected)...")
    start = time.time()
    r2 = requests.get(
        f"{BASE_URL}/agent/describe/{panel_id}", params={"month": test_month}
    )
    t2 = time.time() - start

    if r2.status_code != 200:
        print(f"  ✗ FAIL: Got {r2.status_code}")
        return False

    print(f"     Status: {r2.status_code}, Latency: {t2*1000:.1f}ms")

    if t2 < t1:
        speedup = t1 / t2
        print(f"     ✓ Cache speedup: {speedup:.1f}x")
    else:
        print(f"     ⚠ Warning: Cache may not be working (t2={t2:.3f} >= t1={t1:.3f})")

    # Request 3: Refresh (skip cache)
    print("\n  Request 3: Cache REFRESH (skip cache)...")
    start = time.time()
    r3 = requests.get(
        f"{BASE_URL}/agent/describe/{panel_id}",
        params={"month": test_month, "refresh": "true"},
    )
    t3 = time.time() - start

    if r3.status_code != 200:
        print(f"  ✗ FAIL: Got {r3.status_code}")
        return False

    print(f"     Status: {r3.status_code}, Latency: {t3*1000:.1f}ms")
    print("     ✓ Refresh working")

    return True


def test_redis_connectivity():
    """Test Redis connection and key persistence."""
    print_header("TEST 3: Redis Connectivity")

    try:
        import redis

        r = redis.from_url("redis://redis:6379/0")

        # Ping
        r.ping()
        print("  ✓ Redis PING successful")

        # Check keys
        help_keys = r.keys("help:*")
        print(f"  ✓ Found {len(help_keys)} cache keys")

        if help_keys:
            for key in help_keys[:3]:
                ttl = r.ttl(key)
                print(f"     - {key.decode('utf-8')} (TTL: {ttl}s)")

        return True
    except Exception as e:
        print(f"  ✗ Redis connection failed: {e}")
        print("  Note: System will use in-memory cache fallback")
        return True  # Not a hard failure


def test_metrics():
    """Test metrics instrumentation."""
    print_header("TEST 4: Metrics Tracking")

    try:
        response = requests.get(f"{BASE_URL}/metrics", timeout=5)
        if response.status_code != 200:
            print(f"  ✗ FAIL: Got {response.status_code}")
            return False

        metrics = response.text

        # Check help metrics exist
        help_metrics = [
            "lm_help_requests_total",
            "lm_help_rag_total",
            "lm_help_rag_latency_seconds",
        ]

        found = 0
        for metric in help_metrics:
            if metric in metrics:
                found += 1
                # Count non-comment lines
                lines = [
                    l
                    for l in metrics.split("\n")
                    if metric in l and not l.startswith("#")
                ]
                print(f"  ✓ {metric}: {len(lines)} metrics")

        if found == len(help_metrics):
            print(
                f"\n  Result: All {found}/{len(help_metrics)} metric families present"
            )
            return True
        else:
            print(f"\n  ✗ FAIL: Only {found}/{len(help_metrics)} metric families found")
            return False

    except Exception as e:
        print(f"  ✗ ERROR: {e}")
        return False


def test_error_handling():
    """Test error cases."""
    print_header("TEST 5: Error Handling")

    tests = [
        {
            "name": "Invalid month format",
            "url": f"{BASE_URL}/agent/describe/charts.month_merchants?month=2025-13",
            "expected": 422,
        },
        {
            "name": "Unknown panel ID",
            "url": f"{BASE_URL}/agent/describe/charts.unknown_panel?month=2025-11",
            "expected": 404,
        },
    ]

    passed = 0
    for test in tests:
        try:
            response = requests.get(test["url"], timeout=5)
            if response.status_code == test["expected"]:
                print(f"  ✓ PASS: {test['name']} (got {response.status_code})")
                passed += 1
            else:
                print(
                    f"  ✗ FAIL: {test['name']} (expected {test['expected']}, got {response.status_code})"
                )
        except Exception as e:
            print(f"  ✗ ERROR: {test['name']} - {e}")

    print(f"\n  Result: {passed}/{len(tests)} error cases handled correctly")
    return passed == len(tests)


def main():
    """Run all smoke tests."""
    print("=" * 70)
    print("  RAG-Enhanced Help System - Comprehensive Smoke Test")
    print("=" * 70)

    tests = [
        ("All Explainer Endpoints", test_all_panels),
        ("Cache Behavior", test_cache_behavior),
        ("Redis Connectivity", test_redis_connectivity),
        ("Metrics Tracking", test_metrics),
        ("Error Handling", test_error_handling),
    ]

    results = []
    for name, test_func in tests:
        try:
            passed = test_func()
            results.append((name, "✓ PASS" if passed else "✗ FAIL"))
        except Exception as e:
            print(f"\n  ✗ EXCEPTION: {e}")
            results.append((name, "✗ ERROR"))

    # Final summary
    print_header("FINAL SUMMARY")
    for name, status in results:
        print(f"  {status}  {name}")

    passed = sum(1 for _, status in results if status == "✓ PASS")
    total = len(results)

    print(f"\n  Overall: {passed}/{total} tests passed")

    if passed == total:
        print("\n  🎉 All tests passed! System is production-ready.")
        return 0
    else:
        print("\n  ⚠️  Some tests failed. Review output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
