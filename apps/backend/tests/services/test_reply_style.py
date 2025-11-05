"""Tests for conversational reply styling service."""

from app.services.reply_style import style_reply, _greeting, _context_line


class TestGreeting:
    """Test greeting generation."""

    def test_greeting_with_name(self):
        assert _greeting("Alice") == "Hey Alice —"

    def test_greeting_without_name(self):
        assert _greeting(None) == "Hey —"

    def test_greeting_with_empty_string(self):
        """Should fallback when name is empty string."""
        assert _greeting("") == "Hey —"

    def test_greeting_with_whitespace_only(self):
        """Should fallback when name is only whitespace."""
        assert _greeting("   ") == "Hey —"

    def test_greeting_strips_whitespace(self):
        """Should strip leading/trailing whitespace from name."""
        assert _greeting("  Alice  ") == "Hey Alice —"

    def test_greeting_with_non_string(self):
        """Should handle non-string types gracefully."""
        assert _greeting(123) == "Hey —"  # type: ignore
        assert _greeting([]) == "Hey —"  # type: ignore


class TestContextLine:
    """Test context line building."""

    def test_context_line_full(self):
        ctx = {
            "month_label": "August 2025",
            "month_spend": 608,
            "top_merchant": "Whole Foods",
        }
        result = _context_line(ctx)
        assert result == "August 2025 · $608 spent · top merchant: Whole Foods"

    def test_context_line_month_only(self):
        ctx = {"month_label": "August 2025"}
        result = _context_line(ctx)
        assert result == "August 2025"

    def test_context_line_month_and_spend(self):
        ctx = {"month_label": "August 2025", "month_spend": 608}
        result = _context_line(ctx)
        assert result == "August 2025 · $608 spent"

    def test_context_line_empty(self):
        ctx = {}
        result = _context_line(ctx)
        assert result == ""

    def test_context_line_formats_large_spend(self):
        ctx = {"month_spend": 123456}
        result = _context_line(ctx)
        assert result == "$123,456 spent"


class TestStyleReply:
    """Test full reply styling."""

    def test_primary_mode_with_full_context(self):
        content = "You spent $608 this month, slightly above your 3-month average."
        result = style_reply(
            content,
            user_name="Alice",
            mode="primary",
            context={
                "month_label": "August 2025",
                "month_spend": 608,
                "top_merchant": "Whole Foods",
            },
        )

        assert "Hey Alice —" in result
        assert "August 2025 · $608 spent · top merchant: Whole Foods" in result
        assert content in result
        assert "_Tip:_" in result

    def test_primary_mode_without_header(self):
        content = "You spent $608 this month."
        result = style_reply(content, mode="primary", add_header=False)

        assert "Hey" not in result
        assert content in result
        assert "_Tip:_" in result

    def test_nl_txns_mode(self):
        content = "Here's the month summary: $608 total outflows."
        result = style_reply(
            content,
            mode="nl_txns",
            context={"month_label": "August 2025", "month_spend": 608},
        )

        assert "Hey —" in result
        assert "August 2025 · $608 spent" in result
        assert content in result
        assert "_Tip:_" in result

    def test_deterministic_mode(self):
        content = "Here's a quick snapshot using cached metrics: $608 outflows."
        result = style_reply(
            content,
            mode="deterministic",
            context={"month_label": "August 2025", "month_spend": 608},
        )

        assert "Hey —" in result
        assert "August 2025 · $608 spent" in result
        assert content in result
        assert "_Tip:_" in result
        assert "re-run this with the model" in result

    def test_fallback_mode(self):
        content = "Unable to process with LLM. Here's a basic summary."
        result = style_reply(
            content, mode="fallback", context={"month_label": "August 2025"}
        )

        assert "Hey —" in result
        assert content in result
        assert "_Tip:_" in result
        assert "re-run" in result

    def test_custom_next_suggest(self):
        content = "You spent $608 this month."
        result = style_reply(
            content, mode="primary", context={"next_suggest": "Compare vs last month?"}
        )

        assert "_Tip:_ Compare vs last month?" in result

    def test_no_context_still_works(self):
        content = "This is a test reply."
        result = style_reply(content, mode="primary")

        assert "Hey —" in result
        assert content in result
        assert "_Tip:_" in result

    def test_strips_whitespace_from_content(self):
        content = "  \n  Test content with whitespace  \n  "
        result = style_reply(content, mode="primary", add_header=False)

        assert "Test content with whitespace" in result
        assert result.count("Test content") == 1  # Only once, stripped

    def test_mode_affects_tip_content(self):
        content = "Test"

        primary = style_reply(content, mode="primary", add_header=False)
        deterministic = style_reply(content, mode="deterministic", add_header=False)

        assert "break that down" in primary or "flag unusual" in primary
        assert "re-run this with the model" in deterministic
