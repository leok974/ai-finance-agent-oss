"""Tests for forecast endpoint with insufficient history."""

from datetime import date


def test_forecast_no_history_returns_flag(client, fake_auth_env):
    """When DB has no transactions, forecast should return has_history=False."""
    # fake_auth_env provides a clean test DB with no transactions
    resp = client.post(
        "/agent/tools/analytics/forecast/cashflow",
        json={"month": None, "horizon": 3, "model": "auto"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["has_history"] is False
    assert data["forecast"] == []
    assert data["model"] == "none"
    assert "Not enough history" in data["reason"]
    assert data["ok"] is False


def test_forecast_with_minimal_data(client, fake_auth_env, db_session):
    """With < 3 months of data, forecast should return has_history=False."""
    from app.transactions import Transaction

    # Add only 2 months of transactions (below MIN_MONTHS=3)
    db_session.add(
        Transaction(
            user_id=1,
            month="2025-01",
            date=date(2025, 1, 15),
            amount=-100.0,
            merchant="TestMerchant",
            description="Test transaction",
            category="unknown",
        )
    )
    db_session.add(
        Transaction(
            user_id=1,
            month="2025-02",
            date=date(2025, 2, 15),
            amount=-200.0,
            merchant="TestMerchant",
            description="Test transaction",
            category="unknown",
        )
    )
    db_session.commit()

    resp = client.post(
        "/agent/tools/analytics/forecast/cashflow",
        json={"month": None, "horizon": 3},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["has_history"] is False
    assert "Need at least 3 months" in data["reason"]
    assert "found 2" in data["reason"]


def test_forecast_with_zero_activity(client, fake_auth_env, db_session):
    """With 3+ months but zero amounts, forecast should return has_history=False."""
    from app.transactions import Transaction

    # Add 3 months of zero-value transactions
    for m in [(2025, 1), (2025, 2), (2025, 3)]:
        db_session.add(
            Transaction(
                user_id=1,
                month=f"{m[0]}-{m[1]:02d}",
                date=date(m[0], m[1], 15),
                amount=0.0,
                merchant="TestMerchant",
                description="Zero transaction",
                category="unknown",
            )
        )
    db_session.commit()

    resp = client.post(
        "/agent/tools/analytics/forecast/cashflow",
        json={"month": None, "horizon": 3},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["has_history"] is False
    assert "near-zero activity" in data["reason"]


def test_forecast_with_sufficient_history(client, fake_auth_env, db_session):
    """With 3+ months of real data, forecast should succeed with has_history=True."""
    from app.transactions import Transaction

    # Add 4 months of realistic transactions
    months = [(2024, 11), (2024, 12), (2025, 1), (2025, 2)]
    for i, (y, m) in enumerate(months):
        db_session.add(
            Transaction(
                user_id=1,
                month=f"{y}-{m:02d}",
                date=date(y, m, 15),
                amount=-500.0 - (i * 100),
                merchant="TestMerchant",
                description="Real transaction",
                category="groceries",
            )
        )
        db_session.add(
            Transaction(
                user_id=1,
                month=f"{y}-{m:02d}",
                date=date(y, m, 1),
                amount=3000.0,
                merchant="Employer",
                description="Salary",
                category="income",
            )
        )
    db_session.commit()

    resp = client.post(
        "/agent/tools/analytics/forecast/cashflow",
        json={"month": None, "horizon": 3},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["has_history"] is True
    assert data["ok"] is True
    assert data["model"] in ("ema", "sarimax")
    assert len(data["forecast"]) == 3
    assert data["reason"] is None
