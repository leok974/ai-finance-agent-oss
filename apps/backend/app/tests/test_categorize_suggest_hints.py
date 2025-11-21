"""
Integration tests for hint-based categorization suggestions.

These tests verify that merchant_category_hints are properly applied to
real-world noisy transaction descriptions, and that high-confidence hints
result in high-confidence suggestions (not falling back to 0.35 priors).
"""

import pytest
from sqlalchemy import text
from app.db import SessionLocal
from app.services.categorize_suggest import suggest_categories_for_txn


# Disable ML feedback for tests (table may not exist in test DB)
@pytest.fixture(autouse=True)
def disable_ml_feedback(monkeypatch):
    """Disable ML feedback scoring for these tests."""
    monkeypatch.setenv("ML_FEEDBACK_SCORES_ENABLED", "0")


class TestCategorizeWithHints:
    """Test hint-based suggestion scoring with real transaction data."""

    @pytest.fixture(scope="class", autouse=True)
    def setup_class_db(self):
        """Set up database with test hints (class-scoped)."""
        db = SessionLocal()

        # Clean up any existing test hints
        db.execute(
            text(
                """
            DELETE FROM merchant_category_hints
            WHERE source = 'test_seed'
        """
            )
        )
        db.commit()

        # Insert test hints with high confidence
        db.execute(
            text(
                """
            INSERT INTO merchant_category_hints
                (merchant_canonical, category_slug, source, confidence)
            VALUES
                ('cvs pharmacy', 'shopping_misc', 'test_seed', 0.86),
                ('harris teeter', 'groceries', 'test_seed', 0.99),
                ('capcut', 'subscriptions_software', 'test_seed', 0.82)
        """
            )
        )
        db.commit()
        db.close()

        yield

        # Cleanup
        db = SessionLocal()
        db.execute(
            text(
                """
            DELETE FROM merchant_category_hints
            WHERE source = 'test_seed'
        """
            )
        )
        db.commit()
        db.close()

    @pytest.fixture(autouse=True)
    def setup_db(self):
        """Provide a database session for each test."""
        self.db = SessionLocal()
        yield
        self.db.close()

    def test_cvs_pharmacy_noisy_description_high_confidence(self):
        """CVS/PHARMACY with store number and address should get high-confidence hint."""
        txn = {
            "merchant": "CVS",
            "description": "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",
            "amount": -19.07,
        }

        results = suggest_categories_for_txn(txn, self.db)

        # Should have at least one suggestion
        assert len(results) > 0

        # Top suggestion should be from the hint
        top = results[0]
        assert top["category_slug"] == "shopping_misc"

        # Score should be >= 0.85 (high confidence hint, not 0.35 prior)
        assert top["score"] >= 0.85, f"Expected score >= 0.85, got {top['score']}"

        # Hint should be in the 'why' explanation
        assert any("hint" in w.lower() for w in top.get("why", []))

        # GUARDRAIL: Ensure no prior suggestion outranks the hint
        prior_scores = [
            s["score"]
            for s in results
            if any("prior" in w.lower() for w in s.get("why", []))
        ]
        assert all(
            ps < top["score"] for ps in prior_scores
        ), f"Hint score ({top['score']}) must beat all prior scores ({prior_scores})"

    def test_harris_teeter_with_location_high_confidence(self):
        """HARRIS TEETER with store number should get very high confidence (0.99)."""
        txn = {
            "merchant": "HARRIS TEETER",
            "description": "HARRIS TEETER #0085 12960 HIGHLAND CROS",
            "amount": -46.29,
        }

        results = suggest_categories_for_txn(txn, self.db)

        assert len(results) > 0
        top = results[0]

        # Should match the hint
        assert top["category_slug"] == "groceries"

        # Very high confidence hint should get score close to 0.99
        assert (
            top["score"] >= 0.95
        ), f"Expected score >= 0.95 for 0.99 hint, got {top['score']}"
        assert any("hint" in w.lower() for w in top.get("why", []))

        # GUARDRAIL: Ensure no prior suggestion outranks the hint
        prior_scores = [
            s["score"]
            for s in results
            if any("prior" in w.lower() for w in s.get("why", []))
        ]
        assert all(
            ps < top["score"] for ps in prior_scores
        ), f"Hint score ({top['score']}) must beat all prior scores ({prior_scores})"

    def test_capcut_simple_name_moderate_confidence(self):
        """CapCut (simple name) should get hint with confidence >= 0.82."""
        txn = {
            "merchant": "CAPCUT",
            "description": "CapCut",
            "amount": -19.99,
        }

        results = suggest_categories_for_txn(txn, self.db)

        assert len(results) > 0
        top = results[0]

        # Should match the hint
        assert top["category_slug"] == "subscriptions_software"

        # Hint confidence is 0.82, should get score >= 0.82 (not prior fallback)
        assert top["score"] >= 0.80, f"Expected score >= 0.80, got {top['score']}"
        assert any("hint" in w.lower() for w in top.get("why", []))

    def test_unknown_merchant_falls_back_to_prior(self):
        """Unknown merchant (no hint) should fall back to prior with ~0.35 score."""
        txn = {
            "merchant": "TOTALLY UNKNOWN MERCHANT XYZ",
            "description": "TOTALLY UNKNOWN MERCHANT XYZ #999",
            "amount": -50.00,
        }

        results = suggest_categories_for_txn(txn, self.db)

        # Should still get suggestions (priors)
        assert len(results) > 0

        # All suggestions should be prior fallback with low scores
        for sugg in results:
            assert (
                sugg["score"] <= 0.40
            ), "Unknown merchant should have prior scores <= 0.40"
            assert any("prior" in w.lower() for w in sugg.get("why", []))

    def test_hint_beats_prior_in_ranking(self):
        """Hint-based suggestion should rank higher than prior fallback."""
        # CVS hint: confidence 0.86 → score >= 0.86
        # Prior fallback: score = 0.35
        txn = {
            "merchant": "CVS",
            "description": "CVS/PHARMACY #02006",
            "amount": -10.00,
        }

        results = suggest_categories_for_txn(txn, self.db)

        # Should have multiple suggestions
        assert len(results) >= 2

        # Top suggestion should be the hint
        top = results[0]
        assert top["category_slug"] == "shopping_misc"
        assert top["score"] >= 0.85

        # If there's a prior suggestion, it should have lower score
        prior_suggestions = [
            r for r in results if any("prior" in w.lower() for w in r.get("why", []))
        ]
        if prior_suggestions:
            for prior in prior_suggestions:
                assert (
                    prior["score"] < top["score"]
                ), f"Hint score ({top['score']}) should beat prior score ({prior['score']})"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
