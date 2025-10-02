PATH = "/agent/tools/rules/save"

def _post(c, payload: dict):
    return c.post(PATH, json=payload)

def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"

def test_rules_save_seed_update_replace_authorized(auth_client):
    # 1) Seed rules
    seed = {
        "rules": [
            {"id": "auth-u1", "name": "Groceries", "pattern": "aldi|kroger|trader joes|wholefoods", "category": "groceries", "enabled": True}
        ],
        "replace": False,
        "dry_run": False,
    }
    r1 = _post(auth_client, seed); _no_500(r1)

    # 2) Update same id
    upd = {
        "rules": [
            {"id": "auth-u1", "name": "Groceries-Updated", "pattern": "trader joes|wholefoods", "category": "groceries", "enabled": True}
        ],
        "replace": False,
        "dry_run": False,
    }
    r2 = _post(auth_client, upd); _no_500(r2)

    # 3) Replace with new id
    rep = {
        "rules": [
            {"id": "auth-u2", "name": "Transport", "pattern": "uber|lyft", "category": "transport", "enabled": True}
        ],
        "replace": True,
        "dry_run": False,
    }
    r3 = _post(auth_client, rep); _no_500(r3)
    assert r3.status_code in (200, 201, 202, 204, 400, 422)


def test_rules_save_seed_update_replace_authorized_dry_run(auth_client):
    for payload in (
        {"rules": [{"id": "auth-d1", "name": "A",  "pattern": "x|y", "category": "misc", "enabled": True}], "replace": False, "dry_run": True},
        {"rules": [{"id": "auth-d1", "name": "A2", "pattern": "y",   "category": "misc", "enabled": True}], "replace": False, "dry_run": True},
        {"rules": [{"id": "auth-d2", "name": "B",  "pattern": "z",   "category": "misc", "enabled": True}], "replace": True,  "dry_run": True},
    ):
        r = auth_client.post(PATH, json=payload)
        assert r.status_code < 500
