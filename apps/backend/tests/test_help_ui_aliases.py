from __future__ import annotations

from fastapi.testclient import TestClient
from app.main import app

# Use the shared client fixture wiring from tests/conftest.py

def _post_describe(client: TestClient, key: str):
    return client.post("/agent/tools/help/ui/describe", json={"key": key, "with_context": False}).json()


def test_help_aliases_return_same_payload(client: TestClient):
    # canonical key
    res_canonical = _post_describe(client, "cards.overview")
    assert res_canonical.get("key") == "cards.overview"
    assert res_canonical.get("help") is not None

    # alias should map to same canonical help
    res_alias = _post_describe(client, "cards.month_summary")
    assert res_alias.get("key") == "cards.overview"
    assert res_alias.get("help") == res_canonical.get("help")


def test_chart_aliases_top_categories(client: TestClient):
    res_canonical = _post_describe(client, "charts.top_categories")
    assert res_canonical.get("key") == "charts.top_categories"
    assert res_canonical.get("help") is not None

    for alias in ("charts.month_categories", "charts.categories"):
        res_alias = _post_describe(client, alias)
        assert res_alias.get("key") == "charts.top_categories"
        assert res_alias.get("help") == res_canonical.get("help")


def test_chart_aliases_daily_flows(client: TestClient):
    res_canonical = _post_describe(client, "charts.daily_flows")
    assert res_canonical.get("key") == "charts.daily_flows"
    assert res_canonical.get("help") is not None

    res_alias = _post_describe(client, "charts.daily")
    assert res_alias.get("key") == "charts.daily_flows"
    assert res_alias.get("help") == res_canonical.get("help")
