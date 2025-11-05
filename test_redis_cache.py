#!/usr/bin/env python3
"""Test Redis connectivity and cache behavior."""
import redis
import requests
import time

print("=" * 60)
print("Testing Redis & Cache")
print("=" * 60)

# Test Redis connection
try:
    r = redis.from_url('redis://redis:6379/0')
    r.ping()
    print("✓ Redis connected")
    
    # Check existing keys
    help_keys = r.keys("help:*")
    print(f"  Existing cache keys: {len(help_keys)}")
    for key in help_keys[:5]:
        ttl = r.ttl(key)
        print(f"    {key.decode('utf-8')} (TTL: {ttl}s)")
    
except Exception as e:
    print(f"✗ Redis connection failed: {e}")
    print("  Falling back to in-memory cache")

# Test cache behavior
print(f"\n{'='*60}")
print("Testing Cache Hit/Miss")
print(f"{'='*60}")

panel_id = "charts.month_merchants"
month = "2024-01"

# First request (should be miss)
print(f"\n1. First request (cache miss expected)...")
start = time.time()
r1 = requests.get(f"http://localhost:8000/agent/describe/{panel_id}?month={month}")
t1 = time.time() - start
print(f"   Status: {r1.status_code}")
print(f"   Latency: {t1*1000:.1f}ms")
print(f"   Title: {r1.json().get('title', 'N/A')}")

# Second request (should be hit)
print(f"\n2. Second request (cache hit expected)...")
start = time.time()
r2 = requests.get(f"http://localhost:8000/agent/describe/{panel_id}?month={month}")
t2 = time.time() - start
print(f"   Status: {r2.status_code}")
print(f"   Latency: {t2*1000:.1f}ms (should be < 10ms)")
print(f"   Title: {r2.json().get('title', 'N/A')}")

speedup = t1 / t2 if t2 > 0 else 0
print(f"\n   Cache speedup: {speedup:.1f}x")

# Refresh request (skip cache)
print(f"\n3. Refresh request (skip cache)...")
start = time.time()
r3 = requests.get(f"http://localhost:8000/agent/describe/{panel_id}?month={month}&refresh=true")
t3 = time.time() - start
print(f"   Status: {r3.status_code}")
print(f"   Latency: {t3*1000:.1f}ms")
print(f"   Title: {r3.json().get('title', 'N/A')}")

# Check Redis keys again
try:
    r = redis.from_url('redis://redis:6379/0')
    help_keys = r.keys("help:*")
    print(f"\n   Redis now has {len(help_keys)} help keys")
except:
    pass

print(f"\n{'='*60}")
print("Cache Test Complete")
print(f"{'='*60}")
