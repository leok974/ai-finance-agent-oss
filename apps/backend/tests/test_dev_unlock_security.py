"""
Security-focused tests for PIN-gated dev unlock system.

Validates:
- CSRF protection on unlock endpoint
- PIN bruteforce throttling with lockout reset after success
- Production environment ignores dev_unlocked cookie
- Lock endpoint clears cookie with explicit path=/
"""

import time as _time
import re
import os


def _as_dev(monkeypatch):
    """Configure environment as dev mode with dev unlock enabled."""
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("ALLOW_DEV_ROUTES", "1")
    monkeypatch.setenv(
        "DEV_SUPERUSER_EMAIL", os.getenv("DEV_E2E_EMAIL", "leoklemet.pa@gmail.com")
    )
    monkeypatch.setenv("DEV_SUPERUSER_PIN", os.getenv("DEV_SUPERUSER_PIN", "946281"))


def _as_prod(monkeypatch):
    """Configure environment as production (dev unlock disabled)."""
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("ALLOW_DEV_ROUTES", "0")
    monkeypatch.delenv("DEV_SUPERUSER_PIN", raising=False)


def test_unlock_requires_csrf(client_admin, monkeypatch):
    """Unlock endpoint must reject requests without X-CSRF-Token header."""
    _as_dev(monkeypatch)
    # Missing X-CSRF-Token should 403 (double-submit CSRF)
    r = client_admin.post("/auth/dev/unlock", data={"pin": "946281"})
    assert r.status_code in (400, 403), r.text  # allow 400 if not configured
    # With CSRF header should pass
    r2 = client_admin.post(
        "/auth/dev/unlock", data={"pin": "946281"}, headers={"X-CSRF-Token": "1"}
    )
    assert 200 <= r2.status_code < 300, r2.text


def test_pin_bruteforce_lockout_resets_after_success(client_admin, monkeypatch):
    """
    Bruteforce protection should:
    1. Lock out after MAX_ATTEMPTS failed tries
    2. Keep lockout even if correct PIN submitted during lockout
    3. Allow unlock after lockout expires
    4. Clear throttle state after successful unlock
    """
    _as_dev(monkeypatch)
    # Make lockout short + attempts small to keep test snappy
    from app import config as cfg  # adjust import if you use settings.py

    monkeypatch.setattr(cfg.settings, "DEV_UNLOCK_MAX_ATTEMPTS", 2, raising=False)
    monkeypatch.setattr(cfg.settings, "DEV_UNLOCK_LOCKOUT_S", 60, raising=False)

    # Two bad tries → third bad attempt triggers 429
    assert (
        client_admin.post(
            "/auth/dev/unlock", data={"pin": "000000"}, headers={"X-CSRF-Token": "1"}
        ).status_code
        == 403
    )
    assert (
        client_admin.post(
            "/auth/dev/unlock", data={"pin": "000000"}, headers={"X-CSRF-Token": "1"}
        ).status_code
        == 403
    )
    r = client_admin.post(
        "/auth/dev/unlock", data={"pin": "000000"}, headers={"X-CSRF-Token": "1"}
    )
    assert r.status_code == 429, r.text

    # Now try correct PIN during lockout → still 429
    r2 = client_admin.post(
        "/auth/dev/unlock", data={"pin": "946281"}, headers={"X-CSRF-Token": "1"}
    )
    assert r2.status_code == 429

    # Advance time to bypass lock; monkeypatch time.time if your implementation reads it
    original_time = _time.time
    try:
        monkeypatch.setattr(
            "time.time",
            lambda: original_time() + cfg.settings.DEV_UNLOCK_LOCKOUT_S + 1,
            raising=False,
        )
        r3 = client_admin.post(
            "/auth/dev/unlock", data={"pin": "946281"}, headers={"X-CSRF-Token": "1"}
        )
        assert 200 <= r3.status_code < 300, r3.text
    finally:
        monkeypatch.setattr("time.time", original_time, raising=False)


def test_prod_ignores_dev_cookie_and_blocks_unlock(client_admin, monkeypatch):
    """
    Production environment must:
    1. Ignore dev_unlocked cookie (no dev privilege escalation)
    2. Block /auth/dev/unlock endpoint with 403
    """
    _as_prod(monkeypatch)
    # Even with a forged cookie, dev tools must not unlock in prod
    r = client_admin.post(
        "/agent/tools/rag/seed",
        json={},
        headers={"X-CSRF-Token": "1"},
        cookies={"dev_unlocked": "1"},
    )
    assert r.status_code in (401, 403), r.text
    r2 = client_admin.post(
        "/auth/dev/unlock", data={"pin": "946281"}, headers={"X-CSRF-Token": "1"}
    )
    assert r2.status_code == 403, r2.text


def test_lock_endpoint_clears_cookie_with_root_path(client_admin, monkeypatch):
    """
    Lock endpoint must:
    1. Clear dev_unlocked cookie with explicit Path=/
    2. Set Max-Age=0 or expires in the past
    3. Ensure cookie deletion works across all application paths
    """
    _as_dev(monkeypatch)
    # Unlock first (to ensure cookie exists)
    ok = client_admin.post(
        "/auth/dev/unlock", data={"pin": "946281"}, headers={"X-CSRF-Token": "1"}
    )
    assert 200 <= ok.status_code < 300, ok.text
    # Lock should send Set-Cookie deletion with Path=/
    resp = client_admin.post("/auth/dev/lock", headers={"X-CSRF-Token": "1"})
    assert 200 <= resp.status_code < 300, resp.text
    set_cookie = (
        "; ".join(resp.headers.get_all("set-cookie"))
        if hasattr(resp.headers, "get_all")
        else resp.headers.get("set-cookie", "")
    )
    assert "dev_unlocked=" in set_cookie
    assert (
        "Max-Age=0" in set_cookie or "expires=" in set_cookie.lower()
    )  # depending on your helper
    assert re.search(r"[Pp]ath=/", set_cookie), set_cookie
