import json
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _ok(path: str):
    r = client.get(path)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text}"
    # Ensure valid JSON
    json.loads(r.text)


def test_charts_endpoints_exist():
    _ok("/api/charts/month-summary")
    _ok("/api/charts/month-merchants")
    _ok("/api/charts/month-flows")
    _ok("/api/charts/spending-trends?months=6")


def test_rules_endpoints_exist():
    _ok("/api/rules")
    _ok("/api/rules?limit=20&offset=0")
    _ok("/api/rules/suggestions")
    _ok("/api/rules/config")
    _ok("/api/rules/persistent")


def test_suggestions_compat_and_misc():
    _ok("/api/suggestions?window_days=60&min_count=3&max_results=25")
    _ok("/api/config")
    _ok("/api/models")
