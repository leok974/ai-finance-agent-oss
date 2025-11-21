"""
Test rule feedback logging to ML stats.
Ensures enable/disable/delete/category-change actions log feedback for incremental learning.
"""

from app.models.ml_feedback_stats import MlFeedbackMerchantCategoryStats


def test_disable_rule_logs_reject(client, db):
    """Disabling a rule should log reject feedback (weight=1)."""
    # Create a rule
    resp = client.post(
        "/rules",
        json={
            "name": "Test Rule",
            "enabled": True,
            "when": {"merchant_like": "Coffee Shop"},
            "then": {"category": "Dining"},
        },
    )
    assert resp.status_code == 200
    rule_id = int(resp.json()["id"])

    # Clear any existing stats for this merchant/category
    db.query(MlFeedbackMerchantCategoryStats).filter(
        MlFeedbackMerchantCategoryStats.merchant_normalized == "coffee shop",
        MlFeedbackMerchantCategoryStats.category == "Dining",
    ).delete()
    db.commit()

    # Disable the rule
    resp = client.patch(f"/rules/{rule_id}", json={"active": False})
    assert resp.status_code == 200
    assert resp.json()["active"] is False

    # Check that reject feedback was logged
    stats = (
        db.query(MlFeedbackMerchantCategoryStats)
        .filter(
            MlFeedbackMerchantCategoryStats.merchant_normalized == "coffee shop",
            MlFeedbackMerchantCategoryStats.category == "Dining",
        )
        .first()
    )
    assert stats is not None
    assert stats.reject_count == 1
    assert stats.accept_count == 0


def test_enable_rule_logs_accept(client, db):
    """Enabling a rule should log accept feedback (weight=1)."""
    # Create a disabled rule
    resp = client.post(
        "/rules",
        json={
            "name": "Test Rule",
            "enabled": False,
            "when": {"merchant_like": "Gym Membership"},
            "then": {"category": "Fitness"},
        },
    )
    assert resp.status_code == 200
    rule_id = int(resp.json()["id"])

    # Clear any existing stats for this merchant/category
    db.query(MlFeedbackMerchantCategoryStats).filter(
        MlFeedbackMerchantCategoryStats.merchant_normalized == "gym membership",
        MlFeedbackMerchantCategoryStats.category == "Fitness",
    ).delete()
    db.commit()

    # Enable the rule
    resp = client.patch(f"/rules/{rule_id}", json={"active": True})
    assert resp.status_code == 200
    assert resp.json()["active"] is True

    # Check that accept feedback was logged
    stats = (
        db.query(MlFeedbackMerchantCategoryStats)
        .filter(
            MlFeedbackMerchantCategoryStats.merchant_normalized == "gym membership",
            MlFeedbackMerchantCategoryStats.category == "Fitness",
        )
        .first()
    )
    assert stats is not None
    assert stats.accept_count == 1
    assert stats.reject_count == 0


def test_delete_rule_logs_strong_reject(client, db):
    """Deleting a rule should log strong reject feedback (weight=3)."""
    # Create a rule
    resp = client.post(
        "/rules",
        json={
            "name": "Test Rule",
            "enabled": True,
            "when": {"merchant_like": "Bad Merchant"},
            "then": {"category": "Shopping"},
        },
    )
    assert resp.status_code == 200
    rule_id = int(resp.json()["id"])

    # Clear any existing stats for this merchant/category
    db.query(MlFeedbackMerchantCategoryStats).filter(
        MlFeedbackMerchantCategoryStats.merchant_normalized == "bad merchant",
        MlFeedbackMerchantCategoryStats.category == "Shopping",
    ).delete()
    db.commit()

    # Delete the rule
    resp = client.delete(f"/rules/{rule_id}")
    assert resp.status_code == 200

    # Check that strong reject feedback was logged (weight=3)
    stats = (
        db.query(MlFeedbackMerchantCategoryStats)
        .filter(
            MlFeedbackMerchantCategoryStats.merchant_normalized == "bad merchant",
            MlFeedbackMerchantCategoryStats.category == "Shopping",
        )
        .first()
    )
    assert stats is not None
    assert stats.reject_count == 3  # weight=3
    assert stats.accept_count == 0


def test_change_category_logs_both(client, db):
    """Changing rule category should log reject for old, accept for new (weight=2)."""
    # Create a rule
    resp = client.post(
        "/rules",
        json={
            "name": "Test Rule",
            "enabled": True,
            "when": {"merchant_like": "Restaurant ABC"},
            "then": {"category": "Dining"},
        },
    )
    assert resp.status_code == 200
    rule_id = int(resp.json()["id"])

    # Clear any existing stats for this merchant
    db.query(MlFeedbackMerchantCategoryStats).filter(
        MlFeedbackMerchantCategoryStats.merchant_normalized == "restaurant abc"
    ).delete()
    db.commit()

    # Change category from Dining to Entertainment
    resp = client.patch(f"/rules/{rule_id}", json={"category": "Entertainment"})
    assert resp.status_code == 200
    assert resp.json()["category"] == "Entertainment"

    # Check that reject was logged for old category (weight=2)
    old_stats = (
        db.query(MlFeedbackMerchantCategoryStats)
        .filter(
            MlFeedbackMerchantCategoryStats.merchant_normalized == "restaurant abc",
            MlFeedbackMerchantCategoryStats.category == "Dining",
        )
        .first()
    )
    assert old_stats is not None
    assert old_stats.reject_count == 2  # weight=2
    assert old_stats.accept_count == 0

    # Check that accept was logged for new category (weight=2)
    new_stats = (
        db.query(MlFeedbackMerchantCategoryStats)
        .filter(
            MlFeedbackMerchantCategoryStats.merchant_normalized == "restaurant abc",
            MlFeedbackMerchantCategoryStats.category == "Entertainment",
        )
        .first()
    )
    assert new_stats is not None
    assert new_stats.accept_count == 2  # weight=2
    assert new_stats.reject_count == 0


def test_multiple_disable_accumulates(client, db):
    """Multiple disable actions should accumulate reject counts."""
    # Create a rule
    resp = client.post(
        "/rules",
        json={
            "name": "Test Rule",
            "enabled": True,
            "when": {"merchant_like": "Gas Station"},
            "then": {"category": "Transportation"},
        },
    )
    assert resp.status_code == 200
    rule_id = int(resp.json()["id"])

    # Clear any existing stats
    db.query(MlFeedbackMerchantCategoryStats).filter(
        MlFeedbackMerchantCategoryStats.merchant_normalized == "gas station",
        MlFeedbackMerchantCategoryStats.category == "Transportation",
    ).delete()
    db.commit()

    # Disable, enable, disable again
    client.patch(f"/rules/{rule_id}", json={"active": False})
    client.patch(f"/rules/{rule_id}", json={"active": True})
    client.patch(f"/rules/{rule_id}", json={"active": False})

    # Check accumulated counts
    stats = (
        db.query(MlFeedbackMerchantCategoryStats)
        .filter(
            MlFeedbackMerchantCategoryStats.merchant_normalized == "gas station",
            MlFeedbackMerchantCategoryStats.category == "Transportation",
        )
        .first()
    )
    assert stats is not None
    assert stats.reject_count == 2  # disabled twice
    assert stats.accept_count == 1  # enabled once
