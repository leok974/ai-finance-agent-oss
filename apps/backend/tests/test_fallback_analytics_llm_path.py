from fastapi.testclient import TestClient
from app.main import app
import app.analytics_emit as ae

client = TestClient(app)

def test_fallback_emits_on_main_llm_path(monkeypatch):
    called = {}

    def fake_emit(props):
        called.update(props)

    # Patch emitter
    monkeypatch.setattr(ae, "emit_fallback", fake_emit)

    # Force router/tooling to not short-circuit, so we hit the main LLM path
    import app.routers.agent as agent_router
    monkeypatch.setattr(agent_router, "detect_txn_query", lambda text: (False, None))
    monkeypatch.setattr(agent_router, "route_to_tool", lambda *a, **k: None)
    monkeypatch.setattr(agent_router, "route_to_tool_with_fallback", lambda *a, **k: None)

    # Simulate LLM reporting a fallback
    import app.utils.llm as llm
    def fake_call_local_llm(*, model, messages, temperature=0.2, top_p=0.9):
        try:
            llm._fallback_provider.set("openai")
        except Exception:
            pass
        return ("ok", [])
    monkeypatch.setattr(llm, "call_local_llm", fake_call_local_llm)

    resp = client.post("/agent/chat", json={"messages":[{"role":"user","content":"hi"}], "force_llm": True})
    assert resp.status_code == 200
    assert called.get("provider") == "openai"
