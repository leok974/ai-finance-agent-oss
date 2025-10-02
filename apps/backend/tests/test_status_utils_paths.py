import app.status_utils as su


def test_status_utils_flags():
    """Smoke test shape & basic keys; exercises simple branches."""
    # Use simple exported helpers to ensure module imports cleanly.
    # We can't call status_snapshot (not present), so exercise lightweight env-based checks.
    cs = su.check_crypto_via_env()
    assert cs.ok is True and cs.mode in ("disabled", "local", None)
    llm = su.check_llm_health_sync()
    assert llm.ok is True
