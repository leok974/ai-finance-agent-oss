from fastapi.testclient import TestClient
from app.main import app


def test_admin_toggles_cycle(monkeypatch):
    # Set admin token for auth path
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    client = TestClient(app)

    # Initially reflect current state
    r1 = client.get("/admin/toggles", headers={"x-admin-token": "secret"})
    assert r1.status_code == 200
    data = r1.json()
    assert "toggles" in data and "help_rephrase_enabled" in data["toggles"]

    original = data["toggles"]["help_rephrase_enabled"]

    # Flip the toggle
    r2 = client.patch(
        "/admin/toggles",
        json={"help_rephrase_enabled": (not original)},
        headers={"x-admin-token": "secret"},
    )
    assert r2.status_code == 200
    upd = r2.json()
    assert upd["updated"]["help_rephrase_enabled"] == (not original)

    # Fetch again; should persist
    r3 = client.get("/admin/toggles", headers={"x-admin-token": "secret"})
    assert r3.status_code == 200
    assert r3.json()["toggles"]["help_rephrase_enabled"] == (not original)

    # /config should now reflect new value
    r4 = client.get("/config")
    assert r4.status_code == 200
    cfg = r4.json()
    assert cfg["help_rephrase_enabled"] == (not original)

    # Unauthorized access
    r5 = client.get("/admin/toggles")
    assert r5.status_code == 401

    r6 = client.patch("/admin/toggles", json={"help_rephrase_enabled": original})
    assert r6.status_code == 401
