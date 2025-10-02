def test_agent_tools_meta_smoke(client):
    # Use version endpoint (no DB needed) to avoid sqlite path issues in CI when app points to file db.
    r = client.post("/agent/tools/meta/version")
    assert r.status_code == 200
    body = r.json()
    # Keys present (may be None depending on git availability)
    assert "branch" in body and "commit" in body
