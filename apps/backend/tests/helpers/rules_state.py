from __future__ import annotations

RULES_SEED = [
    {
        "id": "seed-1",
        "name": "Groceries",
        "pattern": "aldi|kroger",
        "category": "groceries",
        "enabled": True,
    },
    {
        "id": "seed-2",
        "name": "Rides",
        "pattern": "uber|lyft",
        "category": "transport",
        "enabled": True,
    },
]

CRUD_CANDIDATES = (
    "/agent/tools/rules/crud/save",
    "/agent/tools/rules/upsert",
    "/agent/tools/rules",
    "/api/rules",
)


def seed_via_crud(client) -> bool:
    """Attempt to persist initial rules using an available CRUD-like endpoint."""
    for path in CRUD_CANDIDATES:
        r = client.post(path, json={"rules": RULES_SEED})
        if r.status_code not in (404, 405):
            return r.status_code < 500
    return False


def seed_via_app_state(client) -> None:
    """Fallback: seed directly onto app.state supporting common shapes."""
    app = client.app
    if hasattr(app.state, "rules_map"):
        app.state.rules_map = {r["id"]: r for r in RULES_SEED}
    elif hasattr(app.state, "rules_by_id"):
        app.state.rules_by_id = {r["id"]: r for r in RULES_SEED}
    elif hasattr(app.state, "rules_store"):
        store = getattr(app.state, "rules_store") or {}
        store["items"] = RULES_SEED.copy()
        app.state.rules_store = store
    else:
        app.state.rules = RULES_SEED.copy()


def ensure_seeded_rules(client) -> None:
    if not seed_via_crud(client):
        seed_via_app_state(client)
