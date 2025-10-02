PATH = "/agent/tools/rules/save"

def _post(c, payload: dict):
    return c.post(PATH, json=payload)

def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"

def test_rules_save_duplicate_ids_authorized(auth_client):
    payload = {
        "rules": [
            {"id": "auth-dup", "name": "Coffee A", "pattern": "coffee",   "category": "restaurants", "enabled": True},
            {"id": "auth-dup", "name": "Coffee B", "pattern": "espresso", "category": "restaurants", "enabled": True},
        ],
        "replace": False,
        "dry_run": False,
    }
    r = _post(auth_client, payload)
    _no_500(r)
    assert r.status_code in (200, 201, 202, 204, 400, 422)
