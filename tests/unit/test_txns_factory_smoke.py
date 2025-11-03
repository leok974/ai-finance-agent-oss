import pytest

from tests.factories.txns import create_txn


def test_create_txn_fills_month_and_allows_overrides():
    t = create_txn(date_="2025-10-03", amount=-42.5, description="Groceries")
    assert t["date"] == "2025-10-03"
    assert t["month"] == "2025-10"
    assert t["amount"] == -42.5
    assert t["description"] == "Groceries"

    t2 = create_txn(date_="2025-09-30")
    assert t2["month"] == "2025-09"

    t3 = create_txn(date_="2025-09-30", month="2024-01")
    assert t3["month"] == "2024-01"


def test_create_txn_month_year_boundary():
    dec = create_txn(date_="2024-12-31")
    jan = create_txn(date_="2025-01-01")
    assert dec["month"] == "2024-12"
    assert jan["month"] == "2025-01"


def test_factory_sign_and_override_month():
    t1 = create_txn(amount=-10)
    assert t1["amount"] == -10.0
    t2 = create_txn(date_="2025-03-15", month="2025-04")
    assert t2["date"] == "2025-03-15" and t2["month"] == "2025-04"


def test_create_txn_currency_normalization():
    base = create_txn(currency="eur")
    assert base["currency"] == "EUR"
    override = create_txn(**{"currency": "gbp"})
    assert override["currency"] == "GBP"


def test_create_txn_invalid_currency_raises():
    with pytest.raises(ValueError):
        create_txn(currency="US")
    with pytest.raises(ValueError):
        create_txn(currency="12$")


def test_create_txn_quantizes_amount_to_cents():
    t = create_txn(amount=12.3456)
    assert t["amount"] == 12.35
    override = create_txn(**{"amount": 0.994})
    assert override["amount"] == 0.99
