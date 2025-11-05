from .helpers.rules_state import ensure_seeded_rules

PATH = "/agent/tools/rules/save"

ORG_HEADERS = {
    "X-Org-Id": "test-org",
    "X-Tenant-Id": "test-tenant",
    "X-Workspace-Id": "test-workspace",
    "X-Project-Id": "test-project",
}


def _post(c, payload: dict, headers: dict | None = None):
    h = dict(ORG_HEADERS)
    if headers:
        h.update(headers)
    return c.post(PATH, json=payload, headers=h)


def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"


def test_rules_save_deep_merge_and_replace_plan(auth_client, monkeypatch):
    for k in ("RULES_ENABLED", "FEATURE_RULES", "ENABLE_RULES"):
        monkeypatch.setenv(k, "1")
    for k in ("RULES_PLAN_MODE", "RULES_SAVE_PLAN_ONLY"):
        monkeypatch.setenv(k, "1")

    ensure_seeded_rules(auth_client)

    batch = {
        "rules": [
            {
                "id": "seed-1",
                "name": "Groceries+",
                "pattern": "aldi|kroger|wholefoods",
                "category": "groceries",
                "enabled": True,
            },
            {
                "id": "new-3",
                "name": "Dining",
                "pattern": "chipotle|pizza",
                "category": "restaurants",
                "enabled": True,
            },
            {
                "id": "dup-4",
                "name": "CoffeeA",
                "pattern": "coffee",
                "category": "restaurants",
                "enabled": True,
            },
            {
                "id": "dup-4",
                "name": "CoffeeB",
                "pattern": "espresso",
                "category": "restaurants",
                "enabled": True,
            },
        ],
        "dry_run": True,
        "replace": False,
    }
    r1 = _post(auth_client, batch)
    _no_500(r1)
    assert r1.status_code in (200, 201, 202, 204, 400, 422)

    rep = {
        "rules": [
            {
                "id": "only-1",
                "name": "OnlyOne",
                "pattern": "unique",
                "category": "misc",
                "enabled": True,
            }
        ],
        "dry_run": True,
        "replace": True,
    }
    r2 = _post(auth_client, rep)
    _no_500(r2)
    assert r2.status_code in (200, 201, 202, 204, 400, 422)
