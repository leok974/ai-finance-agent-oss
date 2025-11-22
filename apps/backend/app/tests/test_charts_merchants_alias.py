"""
Test that charts endpoints expose canonical merchant aliases.

Ensures merchant data includes:
- merchant_canonical: canonical grouping key (lowercase, normalized)
- merchant_display: user-facing label
- sample_description: raw transaction text example
"""

from app.services.charts_data import canonical_and_label


class TestCanonicalAndLabel:
    """Test canonical_and_label function that powers merchant normalization."""

    def test_returns_tuple_of_canonical_and_display(self):
        """Should return (canonical_key, display_label) tuple."""
        canonical, display = canonical_and_label("CVS/PHARMACY #02006")

        assert isinstance(canonical, str)
        assert isinstance(display, str)
        assert len(canonical) > 0
        assert len(display) > 0

    def test_canonical_is_lowercase_normalized(self):
        """Canonical key should be lowercase and normalized."""
        canonical, _ = canonical_and_label("CVS/PHARMACY #02006 2006-2525")

        # Should be lowercase
        assert canonical == canonical.lower(), f"Expected lowercase, got: {canonical}"

        # Should not contain store numbers
        assert "#02006" not in canonical
        assert "2006-2525" not in canonical

    def test_display_is_user_friendly(self):
        """Display label should be title-cased and readable."""
        _, display = canonical_and_label("CVS/PHARMACY #02006")

        # Display should be more user-friendly than raw input
        assert "#02006" not in display, "Display should not have store number"

        # Should start with uppercase (Title Case or brand name)
        if display and display != "unknown":
            assert display[0].isupper() or not display[0].isalpha()

    def test_groups_cvs_variants_to_same_canonical(self):
        """Different CVS store numbers should map to same canonical key."""
        canonical1, _ = canonical_and_label("CVS/PHARMACY #02006")
        canonical2, _ = canonical_and_label("CVS/PHARMACY #00121")
        canonical3, _ = canonical_and_label("CVS PHARMACY")

        # All should have same canonical key
        assert canonical1 == canonical2 == canonical3

    def test_harris_teeter_normalization(self):
        """Harris Teeter variants should normalize consistently."""
        canonical, display = canonical_and_label(
            "HARRIS TEETER #0085 12960 HIGHLAND CROS"
        )

        assert "harris" in canonical.lower()
        assert "teeter" in canonical.lower()
        # Address should be stripped
        assert "highland" not in canonical.lower()
        assert "#0085" not in canonical

    def test_playstation_brand_rule(self):
        """PlayStation should match brand rule."""
        canonical, display = canonical_and_label("PLAYSTATION*NETWORK 123-456-7890")

        # Should match the playstation brand rule
        assert canonical == "playstation"
        assert display == "PlayStation"

    def test_unknown_merchant_fallback(self):
        """Unknown merchant should have sensible fallback."""
        canonical, display = canonical_and_label("RANDOM MERCHANT NAME")

        # Should have some canonical form
        assert canonical is not None and len(canonical) > 0
        assert display is not None and len(display) > 0

        # Should be lowercased and cleaned
        assert canonical == canonical.lower()

    def test_empty_input_handling(self):
        """Empty/null input should return 'unknown'."""
        canonical, display = canonical_and_label("")

        assert canonical == "unknown"
        assert display.lower() == "unknown"

    def test_display_name_length_limit(self):
        """Very long names should be truncated in display."""
        long_name = "EXTREMELY LONG MERCHANT NAME WITH MANY WORDS AND DETAILS"
        _, display = canonical_and_label(long_name)

        # Display should be truncated to reasonable length
        if len(display) > 32:
            assert display.endswith(
                "..."
            ), "Long names should be truncated with ellipsis"

    def test_preserves_brand_consistency(self):
        """Same merchant with variations should have consistent canonical."""
        canonical1, display1 = canonical_and_label("CVS/PHARMACY #02006")
        canonical2, display2 = canonical_and_label("CVS/PHARMACY #00121")

        # Canonical should be identical (both CVS variants)
        assert (
            canonical1 == canonical2
        ), f"Expected same canonical, got {canonical1} != {canonical2}"

        # Display should be identical or very similar
        assert (
            display1 == display2
        ), f"Expected same display, got {display1} != {display2}"
