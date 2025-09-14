def test_help_ui_describe(client):
    r = client.post("/agent/tools/help/ui/describe", json={"key": "charts.month_flows"})
    assert r.status_code == 200
    j = r.json()
    assert j["help"]["title"].startswith("Cash In vs Out")
