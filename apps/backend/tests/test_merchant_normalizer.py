# apps/backend/tests/test_merchant_normalizer.py

from app.services.merchant_normalizer import normalize_merchant_for_category


def test_now_withdrawal_zelle_classified_as_transfers():
    raw = "NOW Withdrawal Zelle To MAYUR SOLANKI +1-202-212-6400"
    norm = normalize_merchant_for_category(raw)

    assert norm.display == "Zelle transfer"
    assert norm.kind == "p2p"
    assert norm.category_hint == "transfers"


def test_venmo_is_p2p_transfers():
    raw = "VENMO PAYMENT 230113 1020301234"
    norm = normalize_merchant_for_category(raw)

    assert norm.display == "Venmo"
    assert norm.kind == "p2p"
    assert norm.category_hint == "transfers"


def test_cash_app_is_p2p_transfers():
    raw = "SQ *CASH APP 12-02 800-123-4567"
    norm = normalize_merchant_for_category(raw)

    assert norm.display == "Cash App"
    assert norm.kind == "p2p"
    assert norm.category_hint == "transfers"


def test_paypal_generic_is_p2p_transfers():
    raw = "PAYPAL *TRANSFER 4029357733"
    norm = normalize_merchant_for_category(raw)

    assert norm.display == "PayPal"
    assert norm.kind == "p2p"
    assert norm.category_hint == "transfers"


def test_paypal_merchant_like_netflix_not_forced_to_transfers():
    raw = "PAYPAL *NETFLIX.COM 800-123-456"
    norm = normalize_merchant_for_category(raw)

    # Still normalized label, but no forced transfers hint
    assert norm.display.startswith("Paypal")
    assert norm.category_hint in (None, "unknown", "other")


def test_apple_cash_is_p2p_transfers():
    raw = "APPLE CASH 1234567890"
    norm = normalize_merchant_for_category(raw)

    assert norm.display == "Apple Cash"
    assert norm.kind == "p2p"
    assert norm.category_hint == "transfers"


def test_generic_merchant_gets_basic_normalization():
    raw = "SOME RANDOM MERCHANT 12345678"
    norm = normalize_merchant_for_category(raw)

    assert norm.display == "Some Random Merchant"
    assert norm.kind is None
    assert norm.category_hint == "unknown"


def test_empty_merchant_returns_unknown():
    raw = ""
    norm = normalize_merchant_for_category(raw)

    assert norm.display == "Unknown"
    assert norm.category_hint == "unknown"
