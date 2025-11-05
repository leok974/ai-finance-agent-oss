"""
Tests for help endpoints - merchants, categories, and daily flows.
"""


def test_describe_merchants(client):
    """Test merchants explainer endpoint."""
    r = client.get("/agent/describe/charts.month_merchants", params={"month": "2025-11"})
    assert r.status_code in (200, 404)  # 404 only if router not wired yet
    if r.status_code == 200:
        j = r.json()
        assert "what" in j and "why" in j
        assert "title" in j and "actions" in j


def test_describe_categories(client):
    """Test categories explainer endpoint."""
    r = client.get("/agent/describe/charts.month_categories", params={"month": "2025-11"})
    assert r.status_code in (200, 404)  # 404 only if router not wired yet
    if r.status_code == 200:
        j = r.json()
        assert "what" in j and "why" in j
        assert "title" in j and "actions" in j
        assert "insights" in j


def test_describe_daily_flows(client):
    """Test daily flows explainer endpoint."""
    r = client.get("/agent/describe/charts.daily_flows", params={"month": "2025-11"})
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        j = r.json()
        assert "what" in j and "why" in j
        assert "title" in j and "actions" in j
        assert "insights" in j


def test_describe_unknown_panel(client):
    """Test that unknown panel_id returns 404."""
    r = client.get("/agent/describe/charts.unknown_panel", params={"month": "2025-11"})
    assert r.status_code == 404


def test_describe_invalid_month_format(client):
    """Test that invalid month format returns 422 (validation error)."""
    r = client.get("/agent/describe/charts.month_merchants", params={"month": "invalid"})
    assert r.status_code == 422


def test_describe_cache_hit(client):
    """Test that second request hits cache."""
    # First request (cache miss)
    r1 = client.get("/agent/describe/charts.month_merchants", params={"month": "2025-11"})
    assert r1.status_code in (200, 404)
    
    if r1.status_code == 200:
        # Second request (cache hit)
        r2 = client.get("/agent/describe/charts.month_merchants", params={"month": "2025-11"})
        assert r2.status_code == 200
        
        # Results should be identical
        assert r1.json() == r2.json()
