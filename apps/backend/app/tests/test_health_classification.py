import os
from app.routers.health import classify_health

def test_health_ok_when_only_crypto_disabled(monkeypatch):
    monkeypatch.delenv("CRYPTO_STRICT_STARTUP", raising=False)
    payload = classify_health(["crypto_disabled"], strict=False)
    assert payload["ok"] is True
    assert payload["status"] == "ok"
    assert payload["reasons"] == []  # suppressed when not strict
    assert payload["info_reasons"] == ["crypto_disabled"]
    assert payload["warn_reasons"] == []

def test_health_degraded_on_warn_reason(monkeypatch):
    payload = classify_health(["alembic_out_of_sync"], strict=False)
    assert payload["ok"] is False
    assert payload["status"] == "degraded"
    assert "alembic_out_of_sync" in payload["reasons"]
    assert payload["warn_reasons"] == ["alembic_out_of_sync"]

def test_health_strict_mode_flags_disabled_crypto(monkeypatch):
    payload = classify_health(["crypto_disabled"], strict=True)
    assert payload["ok"] is False
    assert payload["status"] == "degraded"
    assert payload["reasons"] == ["crypto_disabled"]
    assert payload["info_reasons"] == ["crypto_disabled"]
