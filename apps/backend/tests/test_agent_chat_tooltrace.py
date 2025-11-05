import datetime as dt
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text


def seed_minimal_data(db: Session):
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
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "1")
    monkeypatch.setenv("DEV_ALLOW_NO_CSRF", "1")


def test_chat_includes_tool_trace_for_deterministic(client, db_session):
    seed_minimal_data(db_session)
    resp = client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "forecast next 2 months"}]},
        headers={"X-CSRF-Token": client.cookies.get("csrf_token", "test")},
    )
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert j.get("mode") == "analytics.forecast"
    assert "tool_trace" in j and isinstance(j["tool_trace"], list)
    t0 = j["tool_trace"][0]
    assert t0.get("mode") in (None, "analytics.forecast") or t0.get("tool") == "router"
    assert isinstance(t0.get("duration_ms"), int)
    assert "args" in j
