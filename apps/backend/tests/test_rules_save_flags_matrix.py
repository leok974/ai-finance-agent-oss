import itertools

PATH = "/agent/tools/rules/save"

def _post(client, payload: dict):
    return client.post(PATH, json=payload)

def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"

def test_rules_save_flag_matrix_no_500(client):
    # try 4 combinations to walk both flags’ branches
    combos = list(itertools.product([False, True], [False, True]))  # (dry_run, replace)
    for i, (dry_run, replace) in enumerate(combos, start=1):
        payload = {
            "rules": [
                {"id": f"m{i}-1", "name": "Coffee", "pattern": "coffee|espresso", "category": "restaurants", "enabled": True},
                {"id": f"m{i}-2", "name": "Ride",   "pattern": "uber|lyft",       "category": "transport",   "enabled": True},
            ],
            "dry_run": dry_run,
            "replace": replace,
        }
        r = _post(client, payload)
        _no_500(r)
        assert r.status_code in (200, 201, 202, 204, 400, 422)
