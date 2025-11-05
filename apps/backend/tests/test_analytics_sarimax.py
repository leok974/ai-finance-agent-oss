import datetime as dt
import importlib.util
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text


def _has_statsmodels() -> bool:
    return importlib.util.find_spec("statsmodels") is not None


def seed_seasonal_year_plus(db: Session):
    """Seed 18 months (1.5 years) with gentle, bounded seasonality.

    Simpler pattern avoids extreme swings that previously produced NaNs in model
    CI computations while still exceeding 12 months to allow seasonal order.
    """
    base_income = 3000.0
    base_grocery = 210.0
    base_transport = 85.0
    start = dt.date(2023, 1, 5)

    def add_month(d: dt.date) -> dt.date:
        year = d.year + (1 if d.month == 12 else 0)
        month = 1 if d.month == 12 else d.month + 1
        return dt.date(year, month, 5)

    rows = []
    cur = start
    for i in range(18):
        year, month = cur.year, cur.month
        month_key = f"{year:04d}-{month:02d}"

        income_delta = 6.0 if i % 4 == 0 else -4.0 if i % 7 == 0 else 0.0
        rows.append(
            {
                "date": cur,
                "amount": base_income + income_delta,
                "merchant": "ACME CO",
                "category": "Income",
                "month": month_key,
            }
        )

        # Groceries mild seasonal pulse every 6 months
        g_delta = 35.0 if i % 6 in (2, 3) else (-25.0 if i % 6 == 5 else 0.0)
        rows.append(
            {
                "date": dt.date(year, month, 12),
                "amount": -(base_grocery + g_delta),
                "merchant": "GROCER",
                "category": "Groceries",
                "month": month_key,
            }
        )

        # Transport subtle cyclical variation
        t_delta = 4.0 if i % 3 == 0 else (-3.0 if i % 3 == 1 else 0.0)
        rows.append(
            {
                "date": dt.date(year, month, 20),
                "amount": -(base_transport + t_delta),
                "merchant": "UBER",
                "category": "Transport",
                "month": month_key,
            }
        )

        cur = add_month(cur)

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


@pytest.mark.ml
@pytest.mark.skipif(not _has_statsmodels(), reason="statsmodels not installed")
def test_sarimax_forecast_path(client, db_session):
    seed_seasonal_year_plus(db_session)

    # Call through the router via chat to keep behavior aligned
    r = client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "forecast next 3 months"}]},
        headers={"X-CSRF-Token": client.cookies.get("csrf_token", "test")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("mode") == "analytics.forecast"
    data = body.get("data") or body.get("result") or {}
    # model should be sarimax when available and we seeded >= 12 months
    assert (data.get("model") or "").lower() == "sarimax"
    fc = data.get("forecast") or []
    assert len(fc) == 3
    # forecast should not be all identical (EMA fallback is constant)
    inflows = [round(f["inflows"], 2) for f in fc]
    assert len(set(inflows)) > 1
