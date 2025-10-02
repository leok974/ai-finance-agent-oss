PATH = "/agent/tools/rules/save"

def _post(client, payload: dict):
    return client.post(PATH, json=payload)

def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"

def test_rules_save_update_then_replace_no_500(client):
    # 1) seed one rule (may 2xx or 4xx depending on strictness)
    seed = {
        "rules": [
            {"id": "u1", "name": "Groceries", "pattern": "aldi|kroger|trader joes|wholefoods", "category": "groceries", "enabled": True}
        ],
        "replace": False
    }
    r1 = _post(client, seed)
    _no_500(r1)

    # 2) update same id with different pattern/name — should traverse update/merge code
    upd = {
        "rules": [
            {"id": "u1", "name": "Groceries-Updated", "pattern": "trader joes|wholefoods", "category": "groceries", "enabled": True}
        ],
        "replace": False
    }
    r2 = _post(client, upd)
    _no_500(r2)

    # 3) now replace with a totally new id — should walk replace branch
    rep = {
        "rules": [
            {"id": "u2", "name": "Transport", "pattern": "uber|lyft", "category": "transport", "enabled": True}
        ],
        "replace": True
    }
    r3 = _post(client, rep)
    _no_500(r3)
    assert r3.status_code in (200, 201, 202, 204, 400, 422)
