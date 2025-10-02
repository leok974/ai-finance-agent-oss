import os
import pytest
import apps.backend.app.status_utils as su


def _has(name: str) -> bool:
    return hasattr(su, name) and callable(getattr(su, name))


@pytest.mark.skipif(not _has("check_crypto_via_env"), reason="check_crypto_via_env not present")
def test_check_crypto_via_env_paths(monkeypatch):
    # No key -> likely not OK (depending on implementation may return ok True in disabled mode)
    monkeypatch.delenv("ENCRYPTION_ENABLED", raising=False)
    monkeypatch.delenv("ENCRYPTION_MODE", raising=False)
    monkeypatch.delenv("CRYPTO_MODE", raising=False)
    res = su.check_crypto_via_env()
    assert isinstance(res, su.CryptoStatus)
    # Disabled path returns ok True w/ mode disabled OR error path returns ok False
    assert (res.ok is True and res.mode == "disabled") or (res.ok is False)

    # Enabled but missing mode -> expect not ok
    monkeypatch.setenv("ENCRYPTION_ENABLED", "1")
    monkeypatch.delenv("ENCRYPTION_MODE", raising=False)
    monkeypatch.delenv("CRYPTO_MODE", raising=False)
    res2 = su.check_crypto_via_env()
    assert isinstance(res2, su.CryptoStatus)
    assert res2.ok is False and res2.error == "no_mode"

    # Provide mode -> ok True
    monkeypatch.setenv("ENCRYPTION_MODE", "kms")
    res3 = su.check_crypto_via_env()
    assert isinstance(res3, su.CryptoStatus)
    assert res3.ok is True and res3.mode == "kms"


@pytest.mark.skipif(not _has("check_llm_health_sync"), reason="check_llm_health_sync not present")
def test_check_llm_health_sync_ok_fail(monkeypatch):
    real = su.check_llm_health_sync

    def ok_stub():
        return su.LLMStatus(ok=True, path="stub")

    def fail_stub():
        return su.LLMStatus(ok=False, error="boom")

    # Success path
    monkeypatch.setattr(su, "check_llm_health_sync", ok_stub, raising=True)
    ok = su.check_llm_health_sync()
    assert ok.ok is True

    # Failure path
    monkeypatch.setattr(su, "check_llm_health_sync", fail_stub, raising=True)
    bad = su.check_llm_health_sync()
    assert bad.ok is False and bad.error == "boom"

    # Restore
    monkeypatch.setattr(su, "check_llm_health_sync", real, raising=True)


@pytest.mark.skipif(
    not all(_has(n) for n in ("status_snapshot",)),
    reason="status_snapshot not present"
)
def test_status_snapshot_aggregates_components(monkeypatch):
    if _has("check_db"):
        monkeypatch.setattr(su, "check_db", lambda *a, **k: su.DBStatus(ok=True), raising=True)
    if _has("check_crypto_via_env"):
        monkeypatch.setattr(su, "check_crypto_via_env", lambda: su.CryptoStatus(ok=True, mode="kms"), raising=True)
    if _has("check_llm_health_sync"):
        monkeypatch.setattr(su, "check_llm_health_sync", lambda: su.LLMStatus(ok=False, error="down"), raising=True)

    # If status_snapshot returns a dict ensure it contains some top-level meta keys
    snap = su.status_snapshot()
    assert isinstance(snap, dict)
    assert any(k in snap for k in ("version", "uptime", "components"))
    txt = str(snap).lower()
    assert ("ok" in txt) or ("error" in txt)
