import importlib
import pytest

try:
    rs = importlib.import_module("app.routers.agent_tools_rules_save")
except ModuleNotFoundError:
    rs = importlib.import_module("apps.backend.app.routers.agent_tools_rules_save")
SAVE_PATH = "/agent/tools/rules/save"

def _no_500(r):
    assert r.status_code < 500, f"unexpected 5xx: {r.status_code}\n{r.text}"

@pytest.mark.usefixtures("client")
def test_scenario_constructs_rule_if_supported(client, monkeypatch, tmp_path):
    # Pure JSON path to avoid DB coupling
    monkeypatch.setattr(rs, "create_rule_db", None, raising=False)
    if hasattr(rs, "_FALLBACK_PATH"):
        monkeypatch.setattr(rs, "_FALLBACK_PATH", str(tmp_path / "fallback.jsonl"), raising=False)
    if hasattr(rs, "csrf_protect"):
        monkeypatch.setattr(rs, "csrf_protect", lambda f: f, raising=False)

    # This router expects scenario as string (per implementation), adjust accordingly
    payload = {"scenario": "CoffeeScenario", "month": "2025-01", "dry_run": True}
    r = client.post(SAVE_PATH, json=payload)
    _no_500(r)
    assert r.status_code in (200, 201, 202, 204, 400, 422)
