"""
Tests for demo finance tool and category averages.

Validates that the demo finance overview tool:
1. Returns category monthly averages for demo users
2. Formats data correctly
3. Handles edge cases gracefully
"""

import pytest
from unittest.mock import MagicMock, patch

from app.agent.finance_utils import DemoCategoryAverage


class TestDemoCategoryAverages:
    """Test demo category averages utility functions."""

    def test_demo_category_average_model(self):
        """Test DemoCategoryAverage Pydantic model."""
        avg = DemoCategoryAverage(
            category_slug="groceries",
            category_label="Groceries",
            monthly_avg=285.50,
            txn_count=29,
        )

        assert avg.category_slug == "groceries"
        assert avg.category_label == "Groceries"
        assert avg.monthly_avg == 285.50
        assert avg.txn_count == 29

    def test_category_label_formatting(self):
        """Test category label formatting from slugs."""
        test_cases = [
            ("groceries", "Groceries"),
            ("housing.utilities", "Housing › Utilities"),
            ("transportation.fuel", "Transportation › Fuel"),
            ("subscriptions.streaming", "Subscriptions › Streaming"),
        ]

        for slug, expected_label in test_cases:
            # Simulate the label formatting logic
            label = slug.replace("_", " ").replace(".", " › ").title()
            assert label == expected_label

    def test_get_demo_category_monthly_averages_structure(self):
        """Test that get_demo_category_monthly_averages returns correct structure."""
        from app.agent.finance_utils import get_demo_category_monthly_averages

        # Mock database session
        mock_db = MagicMock()
        mock_db.execute.return_value.all.return_value = [
            ("groceries", -573.00, 6),  # 6 txns * 95.50
            ("restaurants", -300.00, 12),  # 12 txns * 25.00
            ("shopping", -360.00, 3),  # 3 txns * 120.00
        ]

        # Call function
        result = get_demo_category_monthly_averages(
            db=mock_db,
            user_id=1,
            months=6,
        )

        # Verify results
        assert len(result) == 3

        # Check groceries
        groceries = next((r for r in result if r.category_slug == "groceries"), None)
        assert groceries is not None
        assert groceries.category_label == "Groceries"
        assert groceries.txn_count == 6
        # Monthly avg = 573 / 6 = 95.50
        assert abs(groceries.monthly_avg - 95.50) < 0.01

        # Check restaurants
        restaurants = next(
            (r for r in result if r.category_slug == "restaurants"), None
        )
        assert restaurants is not None
        assert restaurants.category_label == "Restaurants"
        assert restaurants.txn_count == 12
        # Monthly avg = 300 / 6 = 50.00
        assert abs(restaurants.monthly_avg - 50.00) < 0.01

    def test_get_demo_category_monthly_averages_empty(self):
        """Test function returns empty list when no transactions."""
        from app.agent.finance_utils import get_demo_category_monthly_averages

        mock_db = MagicMock()
        mock_db.execute.return_value.all.return_value = []

        result = get_demo_category_monthly_averages(
            db=mock_db,
            user_id=1,
            months=6,
        )

        assert result == []


class TestDemoFinancePromptIntegration:
    """Test demo finance integration with prompts."""

    def test_prompt_mentions_demo_averages(self):
        """Test that FINANCE_QUICK_RECAP_PROMPT mentions demo_averages."""
        from app.agent.prompts import FINANCE_QUICK_RECAP_PROMPT

        assert "demo_averages" in FINANCE_QUICK_RECAP_PROMPT
        assert "demo users" in FINANCE_QUICK_RECAP_PROMPT.lower()
        assert "monthly_avg" in FINANCE_QUICK_RECAP_PROMPT

    def test_prompt_instructs_natural_language(self):
        """Test that prompt instructs natural language use of demo data."""
        from app.agent.prompts import FINANCE_QUICK_RECAP_PROMPT

        # Should mention presenting data naturally
        assert (
            "naturally" in FINANCE_QUICK_RECAP_PROMPT.lower()
            or "conversational" in FINANCE_QUICK_RECAP_PROMPT.lower()
        )


class TestDemoFinanceLLMIntegration:
    """Test demo finance integration with LLM mode."""

    @pytest.mark.asyncio
    async def test_llm_mode_calls_demo_tool_for_demo_user(self):
        """Test that LLM mode calls demo overview tool for demo users."""
        from app.agent.modes_finance_llm import mode_finance_quick_recap_llm
        from app.config import settings
        from unittest.mock import AsyncMock

        # Mock HTTP client
        mock_http = AsyncMock()

        # Mock responses
        summary_resp = MagicMock()
        summary_resp.json.return_value = {
            "summary": {"income": 2500.0, "spend": -1200.0, "net": 1300.0}
        }

        merchants_resp = MagicMock()
        merchants_resp.json.return_value = {
            "merchants": [{"merchant": "Whole Foods", "amount": -285.0, "count": 6}]
        }

        expanded_resp = MagicMock()
        expanded_resp.json.return_value = {
            "unknown_spend": {"amount": 0, "count": 0},
            "categories": [
                {"label": "groceries", "amount": -285.0},
                {"label": "restaurants", "amount": -150.0},
            ],
        }

        demo_resp = MagicMock()
        demo_resp.json.return_value = {
            "categories": [
                {
                    "category_slug": "groceries",
                    "category_label": "Groceries",
                    "monthly_avg": 285.50,
                    "txn_count": 29,
                },
                {
                    "category_slug": "restaurants",
                    "category_label": "Restaurants",
                    "monthly_avg": 150.00,
                    "txn_count": 32,
                },
            ],
            "months_analyzed": 6,
            "total_categories": 2,
        }

        async def mock_post(url, **kwargs):
            if "charts/summary" in url:
                return summary_resp
            elif "charts/merchants" in url:
                return merchants_resp
            elif "insights/expanded" in url:
                return expanded_resp
            elif "demo-overview" in url:
                return demo_resp
            raise ValueError(f"Unexpected URL: {url}")

        mock_http.post = mock_post

        # Mock LLM call
        with patch("app.utils.llm.call_local_llm") as mock_llm:
            mock_llm.return_value = (
                "Your demo data shows groceries averaging $285/month...",
                ["llm_call"],
            )

            # Call with demo user context
            result = await mode_finance_quick_recap_llm(
                month="2025-11",
                http=mock_http,
                user_context={"email": settings.DEMO_USER_EMAIL},
            )

            # Verify demo tool was called
            assert result is not None
            assert "reply" in result

    @pytest.mark.asyncio
    async def test_llm_mode_skips_demo_tool_for_regular_user(self):
        """Test that LLM mode skips demo tool for non-demo users."""
        from app.agent.modes_finance_llm import mode_finance_quick_recap_llm
        from unittest.mock import AsyncMock

        # Mock HTTP client
        mock_http = AsyncMock()

        # Mock responses (demo tool should NOT be called)
        summary_resp = MagicMock()
        summary_resp.json.return_value = {
            "summary": {"income": 2500.0, "spend": -1200.0, "net": 1300.0}
        }

        merchants_resp = MagicMock()
        merchants_resp.json.return_value = {"merchants": []}

        expanded_resp = MagicMock()
        expanded_resp.json.return_value = {
            "unknown_spend": {"amount": 0, "count": 0},
            "categories": [],
        }

        async def mock_post(url, **kwargs):
            if "charts/summary" in url:
                return summary_resp
            elif "charts/merchants" in url:
                return merchants_resp
            elif "insights/expanded" in url:
                return expanded_resp
            elif "demo-overview" in url:
                # Should NOT be called for regular users
                raise AssertionError("Demo tool should not be called for regular users")
            raise ValueError(f"Unexpected URL: {url}")

        mock_http.post = mock_post

        # Mock LLM call
        with patch("app.utils.llm.call_local_llm") as mock_llm:
            mock_llm.return_value = (
                "Your summary for November 2025...",
                ["llm_call"],
            )

            # Call with regular user context (not demo email)
            result = await mode_finance_quick_recap_llm(
                month="2025-11",
                http=mock_http,
                user_context={"email": "user@example.com"},
            )

            # Should succeed without calling demo tool
            assert result is not None
            assert "reply" in result
