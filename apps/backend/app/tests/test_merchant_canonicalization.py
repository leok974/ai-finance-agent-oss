"""
Unit tests for merchant canonicalization.

The canonicalize_merchant function should normalize noisy real-world merchant
descriptions into clean canonical forms that match our merchant_category_hints table.
"""

import pytest
from app.utils.text import canonicalize_merchant


class TestMerchantCanonicalization:
    """Test merchant name normalization for hint matching."""

    def test_cvs_with_store_number_and_address(self):
        """CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON -> cvs pharmacy"""
        result = canonicalize_merchant(
            "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON"
        )
        assert result == "cvs pharmacy"

    def test_cvs_short_form(self):
        """CVS/PHARMACY #02006 -> cvs pharmacy"""
        result = canonicalize_merchant("CVS/PHARMACY #02006")
        assert result == "cvs pharmacy"

    def test_harris_teeter_with_store_and_address(self):
        """HARRIS TEETER #0085 12960 HIGHLAND CROS -> harris teeter (2 tokens max)"""
        result = canonicalize_merchant("HARRIS TEETER #0085 12960 HIGHLAND CROS")
        # Only first 2 tokens kept, address removed
        assert result == "harris teeter"

    def test_harris_teeter_short_form(self):
        """HARRIS TEETER #0085 -> harris teeter"""
        result = canonicalize_merchant("HARRIS TEETER #0085")
        assert result == "harris teeter"

    def test_capcut_unchanged(self):
        """CapCut Singapore -> capcut singapore (preserve both tokens)"""
        result = canonicalize_merchant("CapCut Singapore")
        assert result == "capcut singapore"

    def test_capcut_simple(self):
        """CapCut -> capcut"""
        result = canonicalize_merchant("CapCut")
        assert result == "capcut"

    def test_target_with_location_code(self):
        """TARGET T-1088 -> target"""
        result = canonicalize_merchant("TARGET T-1088")
        assert result == "target"

    def test_starbucks_with_store_number(self):
        """Starbucks Store #123 -> starbucks"""
        result = canonicalize_merchant("Starbucks Store #123")
        assert result == "starbucks"

    def test_doordash_merchant(self):
        """DD *DOORDASH POPEYES -> dd doordash (2 tokens max)"""
        result = canonicalize_merchant("DD *DOORDASH POPEYES")
        assert result == "dd doordash"

    def test_playstation_network(self):
        """PlayStation Network -> playstation network (2 tokens max)"""
        result = canonicalize_merchant("PlayStation Network")
        assert result == "playstation network"

    def test_diacritics_removal(self):
        """Café Gamma -> cafe gamma"""
        result = canonicalize_merchant("  Café—Gamma  ")
        assert result == "cafe gamma"

    def test_amazon_marketplace(self):
        """AMAZON MKTPL -> amazon mktpl (2 tokens max)"""
        result = canonicalize_merchant("AMAZON MKTPL")
        assert result == "amazon mktpl"

    def test_uber_trip(self):
        """UBER *TRIP -> uber trip"""
        result = canonicalize_merchant("UBER *TRIP")
        assert result == "uber trip"

    def test_five_guys_location(self):
        """5GUYS 0127 -> 5guys"""
        result = canonicalize_merchant("5GUYS 0127")
        assert result == "5guys"

    def test_empty_string(self):
        """Empty string -> None"""
        assert canonicalize_merchant("") is None
        assert canonicalize_merchant("   ") is None

    def test_none_input(self):
        """None -> None"""
        assert canonicalize_merchant(None) is None

    def test_special_characters_only(self):
        """!@#$%^&*() -> None (all stripped)"""
        result = canonicalize_merchant("!@#$%^&*()")
        assert result is None or result == ""

    def test_apple_dotcom(self):
        """APPLE.COM/BILL -> apple com"""
        result = canonicalize_merchant("APPLE.COM/BILL")
        assert result == "apple com"

    def test_microsoft_asterisk(self):
        """MICROSOFT*MICROSOFT 365 -> microsoft microsoft (2 tokens max)"""
        result = canonicalize_merchant("MICROSOFT*MICROSOFT 365")
        # Should keep first 2 tokens
        assert result is not None and result == "microsoft microsoft"

    def test_long_address_truncation(self):
        """Merchant with very long address should keep only first 2 tokens"""
        result = canonicalize_merchant(
            "FAIRFAX TOWNE CENTER 4110 MONUMENT CORNER DRIVE SUITE A"
        )
        # Should keep only first 2 tokens
        assert result == "fairfax towne"
        assert result is not None and "monument" not in result

    def test_store_keyword_removal(self):
        """'Store' keyword should be removed"""
        result = canonicalize_merchant("Best Buy Store 456")
        assert result is not None and "store" not in result
        assert result == "best buy"

    def test_inc_suffix_removal(self):
        """'Inc' suffix should be removed"""
        result = canonicalize_merchant("GITHUB INC")
        assert result == "github"

    def test_llc_suffix_removal(self):
        """'LLC' and 'Corp' suffixes should be removed"""
        result = canonicalize_merchant("Acme Corp LLC")
        # Both 'corp' and 'llc' are removed, leaving just 'acme'
        assert result == "acme"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
