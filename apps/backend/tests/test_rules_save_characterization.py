import pytest

PATH = "/agent/tools/rules/save"

def _post(client, payload: dict, qs: str = ""):
    return client.post(PATH + (qs or ""), json=payload)


def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"

@pytest.mark.parametrize("payload", [
    # rules missing entirely
    {"dry_run": False},
    # rules not a list
    {"rules": {"id": "x"}},
    # rules list with non-dict entry
    {"rules": ["not-an-object"]},
    # rule missing fields
    {"rules": [{"id": "r1"}]},
    # duplicate IDs → should hit dedupe/merge/validation branch
    {"rules": [
        {"id": "dup", "name": "A", "pattern": "coffee", "category": "restaurants", "enabled": True},
        {"id": "dup", "name": "B", "pattern": "tea",    "category": "restaurants", "enabled": True},
    ]},
    # bogus types
    {"rules": [
        {"id": "r2", "name": 123, "pattern": ["uber","lyft"], "category": True, "enabled": "yes"},
    ]},
    # clearly broken regex patterns
    {"rules": [
        {"id": "r3", "name": "BadRegex1", "pattern": "(unclosed", "category": "misc", "enabled": True},
        {"id": "r4", "name": "BadRegex2", "pattern": "(?P<oops", "category": "misc", "enabled": True},
    ]},
])

def test_rules_save_early_validation_paths(client, payload):
    r = _post(client, payload)
    _no_500(r)
    assert r.status_code in (200, 201, 202, 204, 400, 422)
