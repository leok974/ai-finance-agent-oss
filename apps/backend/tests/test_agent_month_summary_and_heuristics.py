# NOTE: Placed in apps/backend/tests for default pytest discovery.
import os, datetime as dt
import pytest
from app.services.txns_nl_query import parse_nl_query

pytestmark = pytest.mark.httpapi

HERMETIC = os.getenv("HERMETIC") == "1"

@pytest.mark.skipif(HERMETIC, reason="HTTP client not available in hermetic mode")
def test_merchant_heuristic_verbs_not_captured(client):
    nlq = parse_nl_query("Give me Starbucks spend")
    assert nlq.merchants == ["Starbucks"], nlq.merchants

@pytest.mark.skipif(HERMETIC, reason="HTTP client not available in hermetic mode")
def test_merchant_heuristic_short_tokens_filtered():
    nlq = parse_nl_query("Show UPS charges and go")
    assert any(m.lower() == "ups" for m in nlq.merchants)
    assert not any(m.lower() == "go" for m in nlq.merchants)

@pytest.mark.skipif(HERMETIC, reason="HTTP client not available in hermetic mode")
def test_month_summary_endpoint(client):
    from app.db import get_db
    from app.orm_models import Transaction
    db = next(get_db())
    month = dt.date.today().strftime("%Y-%m")
    base = dt.date.today().replace(day=10)
    fixtures = [
        ("Employer Inc", 3200.0, 0),
        ("WholeFoods", -120.40, 1),
        ("Starbucks", -4.50, 2),
    ]
    for m, amt, off in fixtures:
        db.add(Transaction(merchant_canonical=m, amount=amt, date=base + dt.timedelta(days=off)))
    db.commit()
    r = client.get(f"/agent/summary/month?month={month}")
    assert r.status_code == 200
    data = r.json()
    assert data["month"] == month
    assert pytest.approx(data["income"], rel=1e-3) == 3200.0
    assert pytest.approx(data["expenses"], rel=1e-3) == 124.90
    assert pytest.approx(data["net"], rel=1e-3) == 3200.0 - 124.90
    assert data["top_merchant"]["name"].lower() in {"wholefoods", "starbucks"}

@pytest.mark.skipif(HERMETIC, reason="HTTP client not available in hermetic mode")
def test_month_summary_empty_month(client):
    """Request a future month with no transactions and expect zeroed summary and null top_merchant."""
    future_month = (dt.date.today().replace(day=1) + dt.timedelta(days=40)).strftime("%Y-%m")
    r = client.get(f"/agent/summary/month?month={future_month}")
    assert r.status_code == 200
    data = r.json()
    assert data["month"] == future_month or data["month"] is None  # If validation rejects future month we allow None
    assert data["income"] == 0.0
    assert data["expenses"] == 0.0
    assert data["net"] == 0.0
    assert data["top_merchant"] in (None, {})

@pytest.mark.skipif(HERMETIC, reason="HTTP client not available in hermetic mode")
def test_month_summary_tie_break_top_merchant(client):
    """Two merchants with identical spend should yield deterministic top_merchant (lexical ascending fallback)."""
    from app.db import get_db
    from app.orm_models import Transaction
    db = next(get_db())
    # Use an isolated future month to avoid interference from other tests' data
    month_date = dt.date.today().replace(day=1) + dt.timedelta(days=70)
    month = month_date.strftime("%Y-%m")
    # Construct a base date inside the target future month
    base = month_date.replace(day=15)
    # Defensive: remove any existing rows for that synthetic month
    # Use ORM query for deletion to avoid dialect-specific quoting issues
    db.query(Transaction).filter(Transaction.month == month).delete()
    db.commit()
    fixtures = [
        ("ZetaMart", -50.00, 0),
        ("AlphaStore", -50.00, 1),
    ]
    for m, amt, off in fixtures:
        db.add(Transaction(merchant_canonical=m, amount=amt, date=base + dt.timedelta(days=off)))
    db.commit()
    r = client.get(f"/agent/summary/month?month={month}")
    assert r.status_code == 200
    data = r.json()
    # Expect lexical min of tied merchants (AlphaStore) after deterministic tie-break
    assert data["top_merchant"]["name"] == "AlphaStore"
