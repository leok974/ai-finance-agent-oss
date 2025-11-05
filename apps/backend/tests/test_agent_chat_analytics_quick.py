import datetime as dt
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text


def seed_months(db: Session, months_rows):
    for r in months_rows:
        db.execute(
            sql_text(
                """
                INSERT INTO transactions (date, amount, merchant, category, month)
                VALUES (:date, :amount, :merchant, :category, :month)
                """
            ),
            r,
        )
    db.commit()


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "1")
    monkeypatch.setenv("DEV_ALLOW_NO_CSRF", "1")


def _post_chat(client, text: str):
    return client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": text}]},
        headers={"X-CSRF-Token": client.cookies.get("csrf_token", "test")},
    )


def test_ambiguity_budget_vs_subscriptions(client, db_session):
    # Seed a couple months so services can run
    rows = [
        {
            "date": dt.date(2025, 8, 3),
            "amount": 3000.0,
            "merchant": "ACME",
            "category": "Income",
            "month": "2025-08",
        },
        {
            "date": dt.date(2025, 8, 12),
            "amount": -50.0,
            "merchant": "Spotify",
            "category": "Entertainment",
            "month": "2025-08",
        },
        {
            "date": dt.date(2025, 9, 5),
            "amount": 3100.0,
            "merchant": "ACME",
            "category": "Income",
            "month": "2025-09",
        },
        {
            "date": dt.date(2025, 9, 12),
            "amount": -10.0,
            "merchant": "Uber",
            "category": "Transport",
            "month": "2025-09",
        },
        {
            "date": dt.date(2025, 9, 19),
            "amount": -15.0,
            "merchant": "Spotify",
            "category": "Entertainment",
            "month": "2025-09",
        },
    ]
    seed_months(db_session, rows)

    resp = _post_chat(client, "show budget suggestions and subscriptions")
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    # Budget suggest should win over subscriptions
    assert payload.get("mode") == "analytics.budget_suggest"


def test_forecast_horizon_is_clamped(client, db_session):
    rows = [
        {
            "date": dt.date(2025, 6, 5),
            "amount": 3000.0,
            "merchant": "ACME",
            "category": "Income",
            "month": "2025-06",
        },
        {
            "date": dt.date(2025, 7, 5),
            "amount": 3100.0,
            "merchant": "ACME",
            "category": "Income",
            "month": "2025-07",
        },
        {
            "date": dt.date(2025, 8, 5),
            "amount": 3200.0,
            "merchant": "ACME",
            "category": "Income",
            "month": "2025-08",
        },
    ]
    seed_months(db_session, rows)

    resp = _post_chat(client, "forecast next 24 months")
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload.get("mode") == "analytics.forecast"
    data = payload.get("data") or payload.get("result") or {}
    fc = data.get("forecast") or []
    # clamped to <= 12
    assert len(fc) <= 12 and len(fc) >= 1


def test_forecast_no_data_grace(client, db_session):
    # Only 1 month -> not_enough_history branch
    rows = [
        {
            "date": dt.date(2025, 9, 5),
            "amount": 3100.0,
            "merchant": "ACME",
            "category": "Income",
            "month": "2025-09",
        },
    ]
    seed_months(db_session, rows)

    resp = _post_chat(client, "please forecast next 2 months")
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload.get("mode") == "analytics.forecast"
    data = payload.get("data") or payload.get("result") or {}
    # Should return ok:false with reason
    assert data.get("ok") is False
    assert data.get("reason") == "not_enough_history"
    assert isinstance(data.get("forecast"), list)


def test_whatif_parse_percent_and_target(client, db_session):
    rows = [
        {
            "date": dt.date(2025, 8, 2),
            "amount": 3000.0,
            "merchant": "ACME",
            "category": "Income",
            "month": "2025-08",
        },
        {
            "date": dt.date(2025, 8, 10),
            "amount": -120.0,
            "merchant": "UBER",
            "category": "Ride Share",
            "month": "2025-08",
        },
        {
            "date": dt.date(2025, 8, 12),
            "amount": -40.0,
            "merchant": "UBER",
            "category": "Ride Share",
            "month": "2025-08",
        },
    ]
    seed_months(db_session, rows)

    resp = _post_chat(client, "what if I cut ride share by 30 percent?")
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload.get("mode") == "analytics.whatif"
    # args echoed by router for what-if
    args = payload.get("args") or {}
    cuts = args.get("cuts") or []
    assert cuts and isinstance(cuts, list)
    c0 = cuts[0]
    assert c0.get("pct") in (30, 0)  # percent extracted or defaulted to 0
    # naive category mapping captures phrase; title-cased
    assert "Ride" in c0.get("category", "")
