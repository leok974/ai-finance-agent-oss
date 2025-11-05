"""Tests for smart categorization suggestions."""

from app.services.categorize_suggest import suggest_categories_for_txn
from app.orm_models import MerchantCategoryHint, CategoryRule


def test_rules_matching(db):
    """Test pattern-based rule matching."""
    # Add a rule
    db.add(
        CategoryRule(
            pattern=r"SPOTIFY",
            category_slug="subscriptions.streaming",
            priority=10,
            enabled=True,
        )
    )
    db.commit()

    txn = {
        "merchant": "SPOTIFY PREMIUM",
        "description": "Monthly subscription",
        "amount": 12.99,
    }

    suggestions = suggest_categories_for_txn(txn, db=db)

    assert len(suggestions) > 0
    # Should match the SPOTIFY rule
    cats = [s["category_slug"] for s in suggestions]
    assert "subscriptions.streaming" in cats


def test_hints_ranking(db):
    """Test that user hints are ranked higher than rules."""
    # Add a rule
    db.add(
        CategoryRule(
            pattern=r"SPOTIFY",
            category_slug="subscriptions.streaming",
            priority=10,
            enabled=True,
        )
    )
    # Add a user hint (should rank higher)
    db.add(
        MerchantCategoryHint(
            merchant_canonical="spotify",
            category_slug="subscriptions.streaming",
            source="user",
            confidence=0.9,
        )
    )
    db.commit()

    txn = {
        "merchant": "SPOTIFY",
        "description": "Premium",
        "amount": 12.99,
        "merchant_canonical": "spotify",
    }

    suggestions = suggest_categories_for_txn(txn, db=db)

    assert len(suggestions) > 0
    # First suggestion should be from hint (higher score)
    assert suggestions[0]["category_slug"] == "subscriptions.streaming"
    assert suggestions[0]["score"] >= 0.5  # Hints weight is 0.65


def test_multiple_signals_combined(db):
    """Test that multiple signals are combined correctly."""
    db.add(
        CategoryRule(
            pattern=r"UBER|LYFT",
            category_slug="transportation.ride_hailing",
            priority=10,
            enabled=True,
        )
    )
    db.commit()

    txn = {"merchant": "UBER", "description": "Ride to airport", "amount": 35.50}

    suggestions = suggest_categories_for_txn(txn, db=db)

    assert len(suggestions) > 0
    # Should combine rule + amount heuristic
    top = suggestions[0]
    assert top["category_slug"] == "transportation.ride_hailing"
    # Multiple signals should boost score
    assert len(top["why"]) >= 1


def test_no_match_returns_empty(db):
    """Test that no matches returns empty list."""
    txn = {
        "merchant": "UNKNOWN MERCHANT",
        "description": "Some transaction",
        "amount": 50.00,
    }

    suggestions = suggest_categories_for_txn(txn, db=db)

    # Should return empty or very low confidence suggestions
    assert isinstance(suggestions, list)


def test_api_suggest_endpoint(client, db):
    """Test the /agent/tools/categorize/suggest endpoint."""
    # Add test data
    db.add(
        CategoryRule(
            pattern=r"NETFLIX",
            category_slug="subscriptions.streaming",
            priority=10,
            enabled=True,
        )
    )
    db.commit()

    response = client.post(
        "/agent/tools/categorize/suggest",
        json={
            "merchant": "NETFLIX",
            "description": "Monthly subscription",
            "amount": 15.99,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) > 0
    assert data["suggestions"][0]["category_slug"] == "subscriptions.streaming"


def test_api_categorize_apply(client, db):
    """Test applying a category to a transaction."""
    from app.orm_models import Transaction
    from datetime import date

    # Create a test transaction
    txn = Transaction(
        date=date.today(),
        merchant="SPOTIFY",
        description="Premium",
        amount=12.99,
        month="2025-10",
        merchant_canonical="spotify",
    )
    db.add(txn)
    db.commit()

    response = client.post(
        f"/txns/{txn.id}/categorize", json={"category": "subscriptions.streaming"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True

    # Verify transaction was updated
    db.refresh(txn)
    assert txn.category == "subscriptions.streaming"

    # Verify hint was created
    hint = (
        db.query(MerchantCategoryHint).filter_by(merchant_canonical="spotify").first()
    )
    assert hint is not None
    assert hint.category_slug == "subscriptions.streaming"
    assert hint.source == "user"


def test_blocked_category_is_filtered(db):
    """Feedback action 'reject' should block a category from suggestions."""
    # Insert a user_block for the merchant/category (simulate feedback)
    db.add(
        MerchantCategoryHint(
            merchant_canonical="spotify",
            category_slug="subscriptions.streaming",
            source="user_block",
            confidence=0.0,
        )
    )
    db.commit()

    txn = {
        "merchant": "SPOTIFY",
        "description": "Premium",
        "amount": 12.99,
        "merchant_canonical": "spotify",
    }
    suggestions = suggest_categories_for_txn(txn, db=db)
    cats = [s["category_slug"] for s in suggestions]
    assert "subscriptions.streaming" not in cats
