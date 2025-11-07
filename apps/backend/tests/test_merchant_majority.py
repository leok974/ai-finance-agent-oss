"""Test merchant majority labeling."""


def test_majority_simple(db_session, make_txn, label_txn):
    """Test basic majority voting with sufficient support."""
    t1 = make_txn(merchant="Starbucks", amount=5.50)

    # 3/4 = 0.75 Groceries → PASS support>=3 & p>=0.70
    label_txn(t1, "Groceries")
    label_txn(t1, "Groceries")
    label_txn(t1, "Groceries")
    label_txn(t1, "Dining")

    from app.services.suggest.merchant_labeler import majority_for_merchant

    maj = majority_for_merchant(db_session, "Starbucks")
    assert maj is not None
    assert maj.label == "Groceries"
    assert maj.support == 3
    assert maj.total == 4
    assert maj.p >= 0.75


def test_majority_insufficient_support(db_session, make_txn, label_txn):
    """Test that insufficient support returns None."""
    t1 = make_txn(merchant="SmallMerchant", amount=10.00)

    # Only 2 labels, need MIN_SUPPORT=3
    label_txn(t1, "Shopping")
    label_txn(t1, "Shopping")

    from app.services.suggest.merchant_labeler import majority_for_merchant

    maj = majority_for_merchant(db_session, "SmallMerchant")
    assert maj is None


def test_majority_insufficient_proportion(db_session, make_txn, label_txn):
    """Test that insufficient proportion returns None."""
    t1 = make_txn(merchant="MixedMerchant", amount=15.00)

    # 3/5 = 0.60 < MAJORITY_P=0.70
    label_txn(t1, "Category_A")
    label_txn(t1, "Category_A")
    label_txn(t1, "Category_A")
    label_txn(t1, "Category_B")
    label_txn(t1, "Category_C")

    from app.services.suggest.merchant_labeler import majority_for_merchant

    maj = majority_for_merchant(db_session, "MixedMerchant")
    assert maj is None


def test_suggest_from_majority(db_session, make_txn, label_txn):
    """Test suggestion generation from majority voting."""
    t1 = make_txn(merchant="CoffeeCo", amount=4.25)

    # Create strong majority
    for _ in range(5):
        label_txn(t1, "Dining")

    from app.services.suggest.merchant_labeler import suggest_from_majority

    result = suggest_from_majority(db_session, t1)
    assert result is not None
    label, confidence, reason = result

    assert label == "Dining"
    assert confidence >= 0.70
    assert reason["source"] == "merchant_majority"
    assert reason["merchant"] == "CoffeeCo"
    assert reason["support"] >= 5


def test_empty_merchant(db_session, make_txn):
    """Test handling of empty merchant name."""
    make_txn(merchant="", amount=10.00)

    from app.services.suggest.merchant_labeler import majority_for_merchant

    maj = majority_for_merchant(db_session, "")
    assert maj is None


def test_case_insensitive_matching(db_session, make_txn, label_txn):
    """Test that merchant matching is case-insensitive."""
    t1 = make_txn(merchant="WALMART", amount=50.00)
    t2 = make_txn(merchant="walmart", amount=25.00)
    t3 = make_txn(merchant="WalMart", amount=30.00)

    # All should be counted together
    label_txn(t1, "Groceries")
    label_txn(t2, "Groceries")
    label_txn(t3, "Groceries")

    from app.services.suggest.merchant_labeler import majority_for_merchant

    maj = majority_for_merchant(db_session, "walmart")
    assert maj is not None
    assert maj.support == 3
