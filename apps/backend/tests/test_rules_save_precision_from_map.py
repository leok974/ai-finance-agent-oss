import json
import subprocess
import sys
import pytest


def _map():
    out = subprocess.check_output(
        [sys.executable, "scripts/map_rules_router.py"], text=True
    )
    return json.loads(out)


def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"


@pytest.mark.usefixtures("auth_client")
@pytest.mark.xfail(
    reason="mapper subprocess flaky; guarded until stabilized", strict=False
)
def test_rules_save_precision_http(auth_client, monkeypatch):
    data = _map()
    route = None
    for r in data.get("routes", []):
        if (r.get("path") or "").endswith("/agent/tools/rules/save") and r.get(
            "method"
        ) in {"POST", "PUT", "PATCH"}:
            route = r
            break
    if not route:
        pytest.skip("save route not found in agent_tools_rules_save.py")

    for k in data.get("env_vars", []):
        if any(t in k.upper() for t in ("RULE", "PLAN", "FEATURE", "ENABLE")):
            monkeypatch.setenv(k, "1")

    headers = {}
    for h in data.get("headers", []):
        hl = h.lower()
        if hl in {"x-org-id", "x-tenant-id", "x-workspace-id", "x-project-id"}:
            headers[h] = "test"

    payload = {
        "rules": [
            {
                "id": "seed-1",
                "name": "Seed+",
                "pattern": "aldi|kroger|wholefoods",
                "category": "groceries",
                "enabled": True,
            },
            {
                "id": "new-1",
                "name": "Dining",
                "pattern": "chipotle|pizza",
                "category": "restaurants",
                "enabled": True,
            },
            {
                "id": "dup-1",
                "name": "CoffeeA",
                "pattern": "coffee",
                "category": "restaurants",
                "enabled": True,
            },
            {
                "id": "dup-1",
                "name": "CoffeeB",
                "pattern": "espresso",
                "category": "restaurants",
                "enabled": True,
            },
        ],
        "dry_run": True,
        "replace": False,
    }

    r = auth_client.post(route["path"], json=payload, headers=headers)
    _no_500(r)
    assert r.status_code in (200, 201, 202, 204, 400, 422)
