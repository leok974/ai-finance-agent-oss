from app.services import help_cache as hc


def test_evictions_counter_increments():
    hc.clear()
    hc.reset_stats()
    hc._set_ttl_for_tests(300.0)  # ensure normal default
    hc.set_("k", {"text": "v"})
    assert hc.stats()["size"] == 1
    hc._force_expire_for_tests("k")  # performs eviction + accounting inline
    st = hc.stats()
    assert st["evictions"] == 1
    assert st["misses"] >= 1
    # cleanup
    hc.clear()
    hc.reset_stats()
    hc._set_ttl_for_tests(300.0)
