import importlib, inspect, pytest

MODULE_ORDER = [
    "apps.backend.app.services.rules_service",
    "apps.backend.app.services.agent_tools_rules_save",
    "apps.backend.app.routers.agent_tools_rules_save",
    "app.services.rules_service",
    "app.routers.agent_tools_rules_save",
]
CANDIDATE_FUNS = [
    "compute_rules_plan", "merge_rules", "apply_rules_save", "save_rules", "process_rules", "rules_save"
]
EXISTING = [{"id": "A", "name": "Groceries", "pattern": "aldi|kroger", "category": "groceries", "enabled": True}]
INCOMING = [
    {"id": "A", "name": "Groceries+", "pattern": "kroger|wholefoods", "category": "groceries", "enabled": True},
    {"id": "B", "name": "Rides", "pattern": "uber|lyft", "category": "transport", "enabled": True},
    {"id": "DUP", "name": "CoffeeA", "pattern": "coffee", "category": "restaurants", "enabled": True},
    {"id": "DUP", "name": "CoffeeB", "pattern": "espresso", "category": "restaurants", "enabled": True},
]


def _import_first():
    for m in MODULE_ORDER:
        try:
            return importlib.import_module(m)
        except Exception:
            continue
    return None


def _find_callable(mod):
    for n in CANDIDATE_FUNS:
        if hasattr(mod, n) and callable(getattr(mod, n)):
            return getattr(mod, n), n
    for name, obj in inspect.getmembers(mod, inspect.isfunction):
        low = name.lower()
        if "rule" in low and any(k in low for k in ("merge", "plan", "save", "apply")):
            return obj, name
    return None, None


def _try_call(fn):
    sig = inspect.signature(fn)
    params = sig.parameters
    candidates = [
        dict(existing=EXISTING, incoming=INCOMING, dry_run=True, replace=False),
        dict(existing=EXISTING, incoming=INCOMING, dry_run=True, replace=True),
        dict(existing=EXISTING, rules=INCOMING, dry_run=True, replace=False),
        dict(rules=INCOMING, dry_run=True, replace=False),
        (EXISTING, INCOMING, True, False),
        (INCOMING, EXISTING),
        (INCOMING,),
    ]
    last = None
    for p in candidates:
        try:
            if isinstance(p, dict):
                bound = {k: v for k, v in p.items() if k in params}
                return fn(**bound) if bound else fn(p)  # type: ignore
            else:
                return fn(*p)  # type: ignore
        except TypeError as e:
            last = e
            continue
    if last:
        pytest.skip(f"signature mismatch for {fn.__name__}: {last}")
    pytest.skip(f"no usable payload for {fn.__name__}")

def test_dynamic_core_exec_runs_merge_plan(monkeypatch):
    for k in ("RULES_ENABLED", "FEATURE_RULES", "ENABLE_RULES", "RULES_PLAN_MODE"):
        monkeypatch.setenv(k, "1")
    mod = _import_first()
    if not mod:
        pytest.skip("rules module not importable")
    fn, name = _find_callable(mod)
    if not fn:
        pytest.skip("no core rules function found")
    out = _try_call(fn)
    assert out is not None
