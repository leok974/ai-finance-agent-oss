from fastapi.testclient import TestClient
from app.main import app
import app.analytics_emit as ae

client = TestClient(app)

def test_fallback_emits(monkeypatch):
    called = {}

    def fake_emit(props):
        called.update(props)

    # Patch emitter
    monkeypatch.setattr(ae, "emit_fallback", fake_emit)

    # Force LLM to report a fallback provider via the path the router calls (call_local_llm)
    import app.utils.llm as llm

    def fake_call_local_llm(*, model, messages, temperature=0.2, top_p=0.9):
        # Simulate a fallback
        try:
            llm._fallback_provider.set("openai")  # type: ignore[attr-defined]
        except Exception:
            pass
        return ("ok", [])

    monkeypatch.setattr(llm, "call_local_llm", fake_call_local_llm)

    resp = client.post("/agent/chat", json={"messages":[{"role":"user","content":"hi"}], "force_llm": True})
    assert resp.status_code == 200
    # BackgroundTasks runs within TestClient lifecycle; our fake should be called
    assert called.get("provider") == "openai"
