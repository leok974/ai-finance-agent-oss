"""
Test agent mode detection for quick actions and typed queries.

Ensures that both toolbar buttons (explicit mode) and typed queries
(mode inference) route to the same deterministic pipeline.
"""


def test_detect_mode_quick_recap():
    """Test that quick recap keywords are detected correctly."""
    from app.routers.agent import _detect_mode

    # Test various recap phrasings
    assert _detect_mode("give me a quick recap", {}) == "finance_quick_recap"
    assert _detect_mode("month summary", {}) == "finance_quick_recap"
    assert _detect_mode("summarize my finances", {}) == "finance_quick_recap"
    assert _detect_mode("recap of this month", {}) == "finance_quick_recap"


def test_detect_mode_alerts():
    """Test that alert keywords are detected correctly."""
    from app.routers.agent import _detect_mode

    assert _detect_mode("show me alerts", {}) == "finance_alerts"
    assert _detect_mode("any warnings?", {}) == "finance_alerts"
    assert _detect_mode("alert me", {}) == "finance_alerts"


def test_detect_mode_trends():
    """Test that trend keywords are detected correctly."""
    from app.routers.agent import _detect_mode

    assert _detect_mode("show me trends", {}) == "analytics_trends"
    assert _detect_mode("trend analysis", {}) == "analytics_trends"


def test_detect_mode_subscriptions():
    """Test that subscription keywords are detected correctly."""
    from app.routers.agent import _detect_mode

    assert _detect_mode("find my subscriptions", {}) == "analytics_subscriptions_all"
    assert _detect_mode("show recurring charges", {}) == "analytics_subscriptions_all"
    assert _detect_mode("subscription list", {}) == "analytics_subscriptions_all"


def test_get_tools_for_mode():
    """Test that modes map to correct tool names for planner event."""
    from app.routers.agent import _get_tools_for_mode

    # Quick recap should use insights and charts
    tools = _get_tools_for_mode("finance_quick_recap")
    assert "insights.expanded" in tools
    assert "charts.month_flows" in tools

    # Alerts should use analytics and insights
    tools = _get_tools_for_mode("finance_alerts")
    assert "analytics.alerts" in tools
    assert "insights.anomalies" in tools

    # Trends should use charts
    tools = _get_tools_for_mode("analytics_trends")
    assert "charts.spending_trends" in tools

    # Subscriptions should use analytics
    tools = _get_tools_for_mode("analytics_subscriptions_all")
    assert "analytics.subscriptions" in tools
    assert "analytics.recurring" in tools


def test_mode_detection_fallback():
    """Test that unrecognized queries fall back to general mode."""
    from app.routers.agent import _detect_mode

    # Generic questions should return "general" mode (fall through to LLM with basic tools)
    assert _detect_mode("what is the meaning of life?", {}) == "general"
    assert _detect_mode("hello", {}) == "general"
    assert _detect_mode("random question", {}) == "general"
