import os
import datetime as dt
import pytest

pytestmark = pytest.mark.httpapi

HERMETIC = os.getenv("HERMETIC") == "1"

if not HERMETIC:
    pass  # type: ignore

from app.services.txns_nl_query import parse_nl_query


@pytest.mark.skipif(HERMETIC, reason="HTTP client not available in hermetic mode")
def test_merchant_heuristic_verbs_not_captured(client):
    q = "Give me Starbucks spend"
    nlq = parse_nl_query(q)
    # Expect 'Starbucks' only
    assert nlq.merchants == ["Starbucks"], nlq.merchants


@pytest.mark.skipif(HERMETIC, reason="HTTP client not available in hermetic mode")
def test_merchant_heuristic_short_tokens_filtered():
    # 'Go' should not appear as merchant; 'UPS' whitelisted
    q = "Show UPS charges and go"  # include UPS (allowed) and go (verb)
    nlq = parse_nl_query(q)
    assert "UPS" in nlq.merchants or "ups" in [m.lower() for m in nlq.merchants]
    assert not any(m.lower() == "go" for m in nlq.merchants)


@pytest.mark.skipif(HERMETIC, reason="HTTP client not available in hermetic mode")
def test_month_summary_endpoint(client):
    # Seed via bulk CLI logic by invoking endpoint indirectly not yet; instead insert a few txns manually through ORM
    from app.db import get_db
    from app.orm_models import Transaction

    db = next(get_db())
    today_month = dt.date.today().strftime("%Y-%m")
    base = dt.date.today().replace(day=10)
    txns = [
        Transaction(merchant_canonical="Employer Inc", amount=3200.0, date=base),
        Transaction(
            merchant_canonical="WholeFoods",
            amount=-120.40,
            date=base + dt.timedelta(days=1),
        ),
        Transaction(
            merchant_canonical="Starbucks",
            amount=-4.50,
            date=base + dt.timedelta(days=2),
        ),
    ]
    for t in txns:
        db.add(t)
    db.commit()

    resp = client.get(f"/agent/summary/month?month={today_month}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["month"] == today_month
    assert pytest.approx(data["income"], rel=1e-3) == 3200.0
    # expenses should be abs sum of negatives
    assert pytest.approx(data["expenses"], rel=1e-3) == 124.90
    assert pytest.approx(data["net"], rel=1e-3) == 3200.0 - 124.90
    assert data["top_merchant"]["name"] in {"WholeFoods", "Starbucks"}
