# Smoke tests for /agent/tools/rules/save endpoint
# These assert no 5xx responses for various payload shapes while allowing validation 4xx.

PATH = "/agent/tools/rules/save"


def _post(client, payload: dict, qs: str = ""):
    url = PATH + (qs or "")
    return client.post(url, json=payload)


def test_rules_save_invalid_minimal_payload_no_500(client):
    r = _post(client, {})
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"
    assert r.status_code in (400, 422, 200, 201, 204)


def test_rules_save_minimal_plausible_rule_no_500(client):
    payload = {
        "rules": [
            {
                "id": "r-coffee",
                "name": "Coffee to Restaurants",
                "pattern": "coffee",
                "category": "restaurants",
                "enabled": True,
            }
        ]
    }
    r = _post(client, payload)
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"
    assert r.status_code in (200, 201, 202, 204, 400, 422)


def test_rules_save_multiple_rules_and_flags_no_500(client):
    payload = {
        "rules": [
            {
                "id": "r1",
                "name": "Groceries",
                "pattern": "wholefoods|trader joes",
                "category": "groceries",
                "enabled": True,
            },
            {
                "id": "r2",
                "name": "Transport",
                "pattern": "uber|lyft",
                "category": "transport",
                "enabled": True,
            },
        ],
        "dry_run": True,
        "replace": False,
    }
    r = _post(client, payload)
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"
    assert r.status_code in (200, 201, 202, 204, 400, 422)
