import datetime as dt
import pytest

from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text


def seed_minimal_data(db: Session):
    """
    Seed 3 months with simple inflows/outflows so:
      - KPIs compute averages
      - Forecast has >=3 points of history
    Uses the existing transactions schema (requires month column).
    """
    rows = [
        # 2025-06
        {"date": dt.date(2025, 6, 5),  "amount": 3000.0, "merchant": "ACME CO", "category": "Income", "month": "2025-06"},
        {"date": dt.date(2025, 6, 8),  "amount": -120.0, "merchant": "GROCER",  "category": "Groceries", "month": "2025-06"},
        {"date": dt.date(2025, 6, 12), "amount": -60.0,  "merchant": "UBER",    "category": "Transport", "month": "2025-06"},
        # 2025-07
        {"date": dt.date(2025, 7, 5),  "amount": 3200.0, "merchant": "ACME CO", "category": "Income", "month": "2025-07"},
        {"date": dt.date(2025, 7, 9),  "amount": -150.0, "merchant": "GROCER",  "category": "Groceries", "month": "2025-07"},
        {"date": dt.date(2025, 7, 18), "amount": -80.0,  "merchant": "UBER",    "category": "Transport", "month": "2025-07"},
        # 2025-08
        {"date": dt.date(2025, 8, 5),  "amount": 3100.0, "merchant": "ACME CO", "category": "Income", "month": "2025-08"},
        {"date": dt.date(2025, 8, 10), "amount": -140.0, "merchant": "GROCER",  "category": "Groceries", "month": "2025-08"},
        {"date": dt.date(2025, 8, 24), "amount": -90.0,  "merchant": "UBER",    "category": "Transport", "month": "2025-08"},
    ]

    for r in rows:
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
    # Make /agent/chat work without a running LLM and (optionally) without auth.
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "1")
    monkeypatch.setenv("DEV_ALLOW_NO_CSRF", "1")


def _post_chat(client, text: str):
    return client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": text}]},
        headers={
            "X-CSRF-Token": client.cookies.get("csrf_token", "test")
        }
    )


def test_agent_chat_routes_to_analytics_forecast_e2e(client, db_session):
    seed_minimal_data(db_session)

    resp = _post_chat(client, "can you forecast next 2 months?")
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    assert payload.get("mode") == "analytics.forecast"
    data = payload.get("data") or payload.get("result") or {}
    fc = data.get("forecast") or []
    assert isinstance(fc, list) and len(fc) == 2
    assert {"inflows", "outflows", "net"} <= set(fc[0].keys())


def test_agent_chat_routes_to_analytics_kpis_e2e(client, db_session):
    seed_minimal_data(db_session)

    resp = _post_chat(client, "show KPIs including savings rate")
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    assert payload.get("mode") == "analytics.kpis"
    data = payload.get("data") or payload.get("result") or {}
    kpis = data.get("kpis") or {}
    for k in ["avg_inflows", "avg_outflows", "avg_net", "savings_rate", "income_volatility"]:
        assert k in kpis
