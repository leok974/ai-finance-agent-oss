import pytest

PATH = "/agent/tools/rules/save"


def _post(client, payload: dict, qs: str = ""):
    return client.post(PATH + (qs or ""), json=payload)


def _assert_no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"


@pytest.mark.parametrize(
    "payload",
    [
        # 1) Empty top-level object
        ({},),
        # 2) Missing "rules" key
        ({"dry_run": True},),
        # 3) Empty rules array
        ({"rules": []},),
        # 4) Rule missing required fields
        ({"rules": [{"id": "r1"}]},),
        # 5) Duplicate IDs to trip de-dupe/merge validation
        (
            {
                "rules": [
                    {
                        "id": "dup",
                        "name": "A",
                        "pattern": "coffee",
                        "category": "restaurants",
                        "enabled": True,
                    },
                    {
                        "id": "dup",
                        "name": "B",
                        "pattern": "tea",
                        "category": "restaurants",
                        "enabled": True,
                    },
                ]
            },
        ),
        # 6) Invalid types (enabled not boolean)
        (
            {
                "rules": [
                    {
                        "id": "r2",
                        "name": "BadEnabled",
                        "pattern": "uber|lyft",
                        "category": "transport",
                        "enabled": "yes",
                    }
                ]
            },
        ),
        # 7) Suspect regex — if backend compiles it, should 4xx; otherwise may 2xx
        (
            {
                "rules": [
                    {
                        "id": "r3",
                        "name": "BadRegex",
                        "pattern": "(unclosed",
                        "category": "misc",
                        "enabled": True,
                    }
                ]
            },
        ),
    ],
)
def test_rules_save_bad_payloads_never_500(client, payload):
    r = _post(client, payload)
    _assert_no_500(r)
    assert r.status_code in (400, 422, 200, 201, 202, 204)


def test_rules_save_dry_run_flag_is_handled(client):
    payload = {
        "rules": [
            {
                "id": "dry1",
                "name": "Dry",
                "pattern": "netflix|spotify",
                "category": "entertainment",
                "enabled": True,
            }
        ],
        "dry_run": True,
    }
    r = _post(client, payload)
    _assert_no_500(r)
    assert r.status_code in (200, 202, 204, 400, 422)


def test_rules_save_replace_flag_exercised(client):
    # First submit (may be accept or validate)
    initial = {
        "rules": [
            {
                "id": "gro1",
                "name": "Groceries",
                "pattern": "wholefoods|trader joes",
                "category": "groceries",
                "enabled": True,
            }
        ],
        "replace": False,
    }
    r1 = _post(client, initial)
    _assert_no_500(r1)

    # Second submit with replace=True to hit replace branch
    second = {
        "rules": [
            {
                "id": "gro2",
                "name": "Groceries2",
                "pattern": "aldi|kroger",
                "category": "groceries",
                "enabled": True,
            }
        ],
        "replace": True,
    }
    r2 = _post(client, second)
    _assert_no_500(r2)
    assert r2.status_code in (200, 201, 202, 204, 400, 422)
