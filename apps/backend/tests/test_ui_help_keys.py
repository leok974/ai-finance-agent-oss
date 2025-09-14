def test_ui_help_known_keys(client):
    keys = [
        "cards.ml_status",
        "cards.budgets",
        "cards.budget_recommendations",
        "cards.top_categories",
        "charts.spending_trends",
    ]
    for k in keys:
        r = client.post("/agent/tools/help/ui/describe", json={"key": k})
        assert r.status_code == 200
        j = r.json()
        assert j["key"] == k
        assert j["help"]["title"]


def test_ui_help_all_keys_have_titles(client):
    # Query without key to get the full list of available help keys
    r = client.post("/agent/tools/help/ui/describe", json={})
    assert r.status_code == 200
    payload = r.json()
    assert "keys" in payload and isinstance(payload["keys"], list)
    keys = payload["keys"]
    assert len(keys) > 0

    # Every key should resolve to a help object with a non-empty title
    for k in keys:
        r = client.post("/agent/tools/help/ui/describe", json={"key": k})
        assert r.status_code == 200, f"status for {k}"
        j = r.json()
        assert j.get("key") == k
        assert j.get("help") and j["help"].get("title"), f"missing title for {k}"


def test_ui_help_with_context_included(client):
    # Keys that the router enriches with optional context
    ctx_keys = [
        "charts.month_merchants",
        "charts.month_flows",
        "charts.spending_trends",
        "cards.month_summary",
    ]
    for k in ctx_keys:
        r = client.post(
            "/agent/tools/help/ui/describe",
            json={"key": k, "with_context": True, "month": "2023-01"},
        )
        assert r.status_code == 200, f"status for {k}"
        j = r.json()
        assert j.get("key") == k
        assert j.get("help") and j["help"].get("title")
        # Context exists whether data or error (router wraps exceptions)
        assert "context" in j and isinstance(j["context"], dict)
