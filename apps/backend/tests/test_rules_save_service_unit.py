import pytest
import importlib

RULES = [
    {
        "id": "A",
        "name": "A",
        "pattern": "aldi|kroger",
        "category": "groceries",
        "enabled": True,
    },
    {
        "id": "A",
        "name": "A2",
        "pattern": "kroger|wholefoods",
        "category": "groceries",
        "enabled": True,
    },
    {
        "id": "B",
        "name": "Rides",
        "pattern": "uber|lyft",
        "category": "transport",
        "enabled": True,
    },
]

CANDIDATE_MODULES = (
    "apps.backend.app.services.rules_service",
    "apps.backend.app.services.agent_tools_rules_save",
    "apps.backend.app.routers.agent_tools_rules_save",
    "app.services.rules_service",
    "app.routers.agent_tools_rules_save",
)

CANDIDATE_FUNCS = (
    "save_rules",
    "apply_rules_save",
    "compute_rules_plan",
    "merge_rules",
)


def _maybe_import_service():
    for mod in CANDIDATE_MODULES:
        try:
            return importlib.import_module(mod)
        except Exception:
            continue
    return None


@pytest.mark.httpapi
def test_rules_core_function_executes_without_router(monkeypatch):
    svc = _maybe_import_service()
    if not svc:
        pytest.skip("rules service module not found")

    fn = None
    for name in CANDIDATE_FUNCS:
        if hasattr(svc, name):
            fn = getattr(svc, name)
            break
    if not fn:
        pytest.skip("no callable core rules function found")

    for attr in ("write_rules", "persist_rules", "audit_rules_change"):
        if hasattr(svc, attr):
            monkeypatch.setattr(svc, attr, lambda *a, **k: None, raising=False)

    existing = [
        {
            "id": "A",
            "name": "A0",
            "pattern": "aldi",
            "category": "groceries",
            "enabled": True,
        }
    ]

    try:
        out = fn(existing=existing, incoming=RULES, dry_run=True, replace=False)  # type: ignore
    except TypeError:
        try:
            out = fn(RULES, existing, dry_run=True, replace=False)  # type: ignore
        except TypeError:
            out = fn(RULES)  # type: ignore

    assert out is not None
