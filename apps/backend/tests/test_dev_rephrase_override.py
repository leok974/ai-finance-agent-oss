import os
from fastapi.testclient import TestClient
from app.main import app
from app.services import help_cache
import app.services.agent_detect as detect


def test_dev_rephrase_override(monkeypatch):
    # Simulate dev env with override flag
    monkeypatch.setenv('LLM_ALLOW_IN_DEV','1')
    monkeypatch.setenv('APP_ENV','dev')
    # Force HELP_REPHRASE_DEFAULT off so query param decides
    monkeypatch.setenv('HELP_REPHRASE_DEFAULT','0')

    # Monkeypatch rephrase helper to return polished text deterministically
    calls = {'n':0}
    def fake_rephrase(panel_id, result, summary):
        calls['n'] += 1
        return f"[polished] {summary}"
    monkeypatch.setattr(detect, 'try_llm_rephrase_summary', fake_rephrase)
    monkeypatch.setattr('app.utils.llm.call_local_llm', lambda *a, **k: ("noop", []))

    client = TestClient(app)
    body = {"month":"2025-08","filters":{}}
    r = client.post('/agent/describe/top_merchants?rephrase=1', json=body)
    assert r.status_code == 200
    j = r.json()
    assert j['rephrased'] is True
    assert j['provider'] == 'primary'
    assert calls['n'] == 1

    # Second call should be cached
    r2 = client.post('/agent/describe/top_merchants?rephrase=1', json=body)
    assert r2.status_code == 200
    j2 = r2.json()
    assert j2['text'] == j['text']
    assert calls['n'] == 1
    help_cache.clear()
