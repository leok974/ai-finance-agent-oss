from app.services.agent_detect import detect_analytics_intent


def test_detect_kpis():
    mode, args = detect_analytics_intent("show KPIs incl savings rate")
    assert mode == "analytics.kpis"


def test_detect_forecast_horizon():
    mode, args = detect_analytics_intent("forecast next 3 months")
    assert mode == "analytics.forecast"
    assert args.get("horizon") == 3


def test_detect_anomalies():
    mode, _ = detect_analytics_intent("anything unusual or outliers this month?")
    assert mode == "analytics.anomalies"


def test_detect_recurring():
    mode, _ = detect_analytics_intent("list recurring monthly charges")
    assert mode == "analytics.recurring"


def test_detect_subscriptions():
    mode, _ = detect_analytics_intent("show subscriptions")
    assert mode == "analytics.subscriptions"


def test_detect_budget_suggest():
    mode, _ = detect_analytics_intent("suggest budget limits from history")
    assert mode == "analytics.budget_suggest"


def test_detect_whatif_pct():
    mode, args = detect_analytics_intent("what if I cut subscriptions by 25%?")
    assert mode == "analytics.whatif"
    assert args["cuts"][0]["pct"] == 25
