from app.utils.text import canonicalize_merchant

def test_basic_canonicalization():
    assert canonicalize_merchant("  Starbucks Store #123 ") == "starbucks store 123"


def test_diacritics_and_dashes():
    assert canonicalize_merchant("Café—Gamma") == "cafe gamma"
    assert canonicalize_merchant("cafe   gamma") == "cafe gamma"


def test_none_and_empty():
    assert canonicalize_merchant(None) is None
    assert canonicalize_merchant("   ") is None
