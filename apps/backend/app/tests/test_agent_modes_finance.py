"""Tests for finance agent modes (quick recap and deep dive)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient


@pytest.fixture
def mock_http_client():
    """Mock AsyncClient for tool API calls."""
    client = AsyncMock(spec=AsyncClient)
    return client


@pytest.fixture
def mock_user_context():
    """Mock user context."""
    return {"user": None, "db": None}


class TestFinanceQuickRecap:
    """Tests for finance_quick_recap mode."""

    @pytest.mark.asyncio
    async def test_deterministic_quick_recap_uses_charts_summary(
        self, mock_http_client, mock_user_context
    ):
        """Test that deterministic quick recap calls charts.summary."""
        from app.agent.modes_finance import mode_finance_quick_recap

        # Mock API responses
        summary_response = MagicMock()
        summary_response.json.return_value = {
            "summary": {"income": 1000.0, "spend": -500.0, "net": 500.0}
        }

        expanded_response = MagicMock()
        expanded_response.json.return_value = {
            "unknown_spend": {"amount": 100.0, "count": 5},
            "categories": [],
        }

        merchants_response = MagicMock()
        merchants_response.json.return_value = {
            "merchants": [{"merchant": "Amazon", "amount": -200.0}]
        }

        async def mock_post(url, **kwargs):
            if "charts/summary" in url:
                return summary_response
            elif "insights/expanded" in url:
                return expanded_response
            elif "charts/merchants" in url:
                return merchants_response
            raise ValueError(f"Unexpected URL: {url}")

        mock_http_client.post = mock_post

        # Call the handler
        result = await mode_finance_quick_recap(
            month="2025-11", http=mock_http_client, user_context=mock_user_context
        )

        # Verify response structure
        assert result["mode"] == "finance_quick_recap"
        assert result["used_context"]["month"] == "2025-11"
        assert "charts.summary" in result["tool_trace"]
        assert result["_router_fallback_active"] is True  # Deterministic
        assert "reply" in result
        assert isinstance(result["suggestions"], list)

    @pytest.mark.asyncio
    async def test_llm_quick_recap_uses_charts_and_llm(
        self, mock_http_client, mock_user_context
    ):
        """Test that LLM quick recap calls tools and LLM."""
        from app.agent.modes_finance_llm import mode_finance_quick_recap_llm

        # Mock API responses
        summary_response = MagicMock()
        summary_response.json.return_value = {
            "summary": {"income": 1000.0, "spend": -500.0, "net": 500.0}
        }

        expanded_response = MagicMock()
        expanded_response.json.return_value = {
            "unknown_spend": {"amount": 100.0, "count": 5},
            "categories": [{"label": "Groceries", "amount": -200.0, "share_pct": 40.0}],
        }

        merchants_response = MagicMock()
        merchants_response.json.return_value = {
            "merchants": [{"merchant": "Amazon", "amount": -200.0, "count": 3}]
        }

        async def mock_post(url, **kwargs):
            if "charts/summary" in url:
                return summary_response
            elif "insights/expanded" in url:
                return expanded_response
            elif "charts/merchants" in url:
                return merchants_response
            raise ValueError(f"Unexpected URL: {url}")

        mock_http_client.post = mock_post

        # Mock LLM call
        with patch("app.utils.llm.call_local_llm") as mock_llm:
            mock_llm.return_value = (
                "Here's your summary for **2025-11**: Income was $1,000, spend was $500...",
                [{"tool": "llm", "status": "ok"}],
            )

            # Call the handler
            result = await mode_finance_quick_recap_llm(
                month="2025-11", http=mock_http_client, user_context=mock_user_context
            )

            # Verify LLM was called
            assert mock_llm.called
            call_args = mock_llm.call_args
            assert call_args.kwargs["messages"][0]["role"] == "system"
            assert (
                "FINANCE_QUICK_RECAP_PROMPT"
                in str(call_args.kwargs["messages"][0]["content"])
                or "quick recap" in call_args.kwargs["messages"][0]["content"].lower()
            )

        # Verify response structure
        assert result["mode"] == "finance_quick_recap"
        assert result["used_context"]["month"] == "2025-11"
        assert "charts.summary" in result["tool_trace"]
        assert "insights.expanded" in result["tool_trace"]
        assert result["_router_fallback_active"] is False  # LLM-powered
        assert "Here's your summary" in result["reply"]


class TestFinanceDeepDive:
    """Tests for finance_deep_dive mode."""

    @pytest.mark.asyncio
    async def test_deterministic_deep_dive_uses_insights_expanded(
        self, mock_http_client, mock_user_context
    ):
        """Test that deterministic deep dive calls insights.expanded."""
        from app.agent.modes_finance import mode_finance_deep_dive

        # Mock API responses
        summary_response = MagicMock()
        summary_response.json.return_value = {
            "summary": {"income": 1000.0, "spend": -500.0, "net": 500.0}
        }

        expanded_response = MagicMock()
        expanded_response.json.return_value = {
            "categories": [
                {"label": "Groceries", "amount": -200.0, "share_pct": 40.0},
                {"label": "Restaurants", "amount": -150.0, "share_pct": 30.0},
            ],
            "anomalies": [
                {
                    "merchant": "Best Buy",
                    "amount": -500.0,
                    "date": "2025-11-15",
                    "reason": "spike",
                }
            ],
        }

        async def mock_post(url, **kwargs):
            if "charts/summary" in url:
                return summary_response
            elif "insights/expanded" in url:
                return expanded_response
            raise ValueError(f"Unexpected URL: {url}")

        mock_http_client.post = mock_post

        # Call the handler
        result = await mode_finance_deep_dive(
            month="2025-11", http=mock_http_client, user_context=mock_user_context
        )

        # Verify response structure
        assert result["mode"] == "finance_deep_dive"
        assert result["used_context"]["month"] == "2025-11"
        assert "insights.expanded" in result["tool_trace"]
        assert result["_router_fallback_active"] is True  # Deterministic
        assert "reply" in result
        assert "Groceries" in result["reply"] or "category" in result["reply"].lower()

    @pytest.mark.asyncio
    async def test_llm_deep_dive_includes_merchants_and_anomalies(
        self, mock_http_client, mock_user_context
    ):
        """Test that LLM deep dive provides rich data to LLM."""
        from app.agent.modes_finance_llm import mode_finance_deep_dive_llm

        # Mock API responses
        summary_response = MagicMock()
        summary_response.json.return_value = {
            "summary": {"income": 1000.0, "spend": -500.0, "net": 500.0}
        }

        expanded_response = MagicMock()
        expanded_response.json.return_value = {
            "categories": [{"label": "Groceries", "amount": -200.0, "share_pct": 40.0}],
            "anomalies": [
                {
                    "merchant": "Best Buy",
                    "amount": -500.0,
                    "date": "2025-11-15",
                    "reason": "spike",
                }
            ],
            "unknown_spend": {"amount": 50.0, "count": 2},
        }

        merchants_response = MagicMock()
        merchants_response.json.return_value = {
            "merchants": [
                {
                    "merchant": "Amazon",
                    "amount": -200.0,
                    "count": 5,
                    "category": "Shopping",
                }
            ]
        }

        async def mock_post(url, **kwargs):
            if "charts/summary" in url:
                return summary_response
            elif "insights/expanded" in url:
                return expanded_response
            elif "charts/merchants" in url:
                return merchants_response
            raise ValueError(f"Unexpected URL: {url}")

        mock_http_client.post = mock_post

        # Mock LLM call
        with patch("app.utils.llm.call_local_llm") as mock_llm:
            mock_llm.return_value = (
                "Deep dive for **2025-11**\n\n**By category** — Groceries: $200 (40% of spend)...",
                [{"tool": "llm", "status": "ok"}],
            )

            # Call the handler
            result = await mode_finance_deep_dive_llm(
                month="2025-11", http=mock_http_client, user_context=mock_user_context
            )

            # Verify LLM was called with structured data
            assert mock_llm.called
            call_args = mock_llm.call_args
            user_message = call_args.kwargs["messages"][1]["content"]

            # Verify the data includes merchants, categories, anomalies
            assert "Amazon" in user_message or "merchants" in user_message
            assert "Groceries" in user_message or "categories" in user_message
            assert "Best Buy" in user_message or "anomalies" in user_message

        # Verify response structure
        assert result["mode"] == "finance_deep_dive"
        assert result["_router_fallback_active"] is False  # LLM-powered
        assert "Deep dive" in result["reply"]


class TestFallbackBehavior:
    """Tests for fallback behavior when LLM is unavailable."""

    @pytest.mark.asyncio
    async def test_quick_recap_falls_back_when_llm_unavailable(
        self, mock_http_client, mock_user_context
    ):
        """Test that wrapper falls back to deterministic when LLM unavailable."""
        from app.agent.modes_finance import finance_quick_recap_with_fallback

        # Mock API responses for deterministic handler
        summary_response = MagicMock()
        summary_response.json.return_value = {
            "summary": {"income": 1000.0, "spend": -500.0, "net": 500.0}
        }

        expanded_response = MagicMock()
        expanded_response.json.return_value = {
            "unknown_spend": {"amount": 100.0, "count": 5},
            "categories": [],
        }

        merchants_response = MagicMock()
        merchants_response.json.return_value = {"merchants": []}

        async def mock_post(url, **kwargs):
            if "charts/summary" in url:
                return summary_response
            elif "insights/expanded" in url:
                return expanded_response
            elif "charts/merchants" in url:
                return merchants_response
            raise ValueError(f"Unexpected URL: {url}")

        mock_http_client.post = mock_post

        # Mock LLM health check to return False
        with patch("app.services.llm_health.is_llm_available") as mock_health:
            mock_health.return_value = False

            # Call the wrapper
            result = await finance_quick_recap_with_fallback(
                month="2025-11", http=mock_http_client, user_context=mock_user_context
            )

            # Verify it used deterministic fallback
            assert result["_router_fallback_active"] is True
            assert result["mode"] == "finance_quick_recap"

    @pytest.mark.asyncio
    async def test_deep_dive_falls_back_when_llm_unavailable(
        self, mock_http_client, mock_user_context
    ):
        """Test that wrapper falls back to deterministic when LLM unavailable."""
        from app.agent.modes_finance import finance_deep_dive_with_fallback

        # Mock API responses
        summary_response = MagicMock()
        summary_response.json.return_value = {
            "summary": {"income": 1000.0, "spend": -500.0, "net": 500.0}
        }

        expanded_response = MagicMock()
        expanded_response.json.return_value = {
            "categories": [{"label": "Groceries", "amount": -200.0, "share_pct": 40.0}],
            "anomalies": [],
        }

        async def mock_post(url, **kwargs):
            if "charts/summary" in url:
                return summary_response
            elif "insights/expanded" in url:
                return expanded_response
            raise ValueError(f"Unexpected URL: {url}")

        mock_http_client.post = mock_post

        # Mock LLM health check to return False
        with patch("app.services.llm_health.is_llm_available") as mock_health:
            mock_health.return_value = False

            # Call the wrapper
            result = await finance_deep_dive_with_fallback(
                month="2025-11", http=mock_http_client, user_context=mock_user_context
            )

            # Verify it used deterministic fallback
            assert result["_router_fallback_active"] is True
            assert result["mode"] == "finance_deep_dive"
