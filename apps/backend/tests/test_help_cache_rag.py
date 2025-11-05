"""
Tests for help cache and RAG integration.
"""
from app.utils.cache import cache_set, cache_get, cache_clear


def test_cache_roundtrip():
    """Test basic cache set/get with TTL."""
    k = "help:charts.month_merchants:2025-11"
    v = {"title": "t", "what": "w", "why": "y"}
    
    # Clear any existing data
    cache_clear()
    
    # Set and get
    cache_set(k, v, ttl=3)
    result = cache_get(k)
    
    assert result == v, f"Expected {v}, got {result}"


def test_cache_expiration():
    """Test that cache entries expire after TTL."""
    import time
    
    k = "help:test:expire"
    v = {"data": "should_expire"}
    
    cache_clear()
    
    # Set with 1 second TTL
    cache_set(k, v, ttl=1)
    
    # Should be available immediately
    assert cache_get(k) == v
    
    # Wait for expiration
    time.sleep(1.1)
    
    # Should be gone
    assert cache_get(k) is None


def test_cache_miss():
    """Test that missing keys return None."""
    cache_clear()
    
    result = cache_get("nonexistent:key")
    assert result is None


def test_cache_overwrite():
    """Test that cache_set overwrites existing values."""
    k = "help:test:overwrite"
    v1 = {"version": 1}
    v2 = {"version": 2}
    
    cache_clear()
    
    cache_set(k, v1, ttl=10)
    assert cache_get(k) == v1
    
    cache_set(k, v2, ttl=10)
    assert cache_get(k) == v2
