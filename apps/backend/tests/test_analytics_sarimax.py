import datetime as dt
import importlib.util
import math
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text


def _has_statsmodels() -> bool:
    return importlib.util.find_spec("statsmodels") is not None


def seed_seasonal_year_plus(db: Session):
    """Seed 14 months with a mild seasonal pattern.
    Income ~3000 + small noise; Outflows vary seasonally via sine on groceries.
    """
    base_income = 3000.0
    base_grocery = 200.0
    base_transport = 80.0
    start = dt.date(2024, 7, 5)
    rows = []
    for i in range(14):
        # month i
        mdate = (start.replace(day=5) + dt.timedelta(days=30 * i))
        year, month = mdate.year, mdate.month
        month_key = f"{year:04d}-{month:02d}"
        # inflow
        rows.append({
            "date": dt.date(year, month, 5),
            "amount": base_income + (10.0 if i % 2 == 0 else -10.0),
            "merchant": "ACME CO",
            "category": "Income",
            "month": month_key,
        })
        # groceries seasonal +/- 40 using sine-ish pattern
        delta = 40.0 if (i % 6 in (2, 3)) else (-40.0 if (i % 6 in (5, 0)) else 0.0)
        rows.append({
            "date": dt.date(year, month, 10),
            "amount": -(base_grocery + delta),
            "merchant": "GROCER",
            "category": "Groceries",
            "month": month_key,
        })
        # transport small variation
        rows.append({
            "date": dt.date(year, month, 20),
            "amount": -(base_transport + (5.0 if i % 3 == 0 else -5.0)),
            "merchant": "UBER",
            "category": "Transport",
            "month": month_key,
        })

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
