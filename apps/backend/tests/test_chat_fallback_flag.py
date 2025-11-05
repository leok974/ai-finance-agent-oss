from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def _body(msg="ping", model="gpt-oss:20b"):
    return {
        "model": model,
        "messages": [{"role": "user", "content": msg}],
        "stream": False,
    }


def test_primary_no_fallback(monkeypatch):
    # Ensure any present OpenAI key doesn't cause a spurious fallback
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    import app.utils.llm as llm_mod

    # stub call to return a deterministic reply and do not set fallback provider
    def ok_call_llm(*, model, messages, temperature=0.2, top_p=0.9):
        # explicitly clear any prior fallback marker
        llm_mod.reset_fallback_provider()
        return "ok", []

    monkeypatch.setattr(llm_mod, "call_local_llm", ok_call_llm)
    res = client.post("/agent/chat", json=_body())
    assert res.status_code == 200
    j = res.json()
    assert "fallback" not in j, j
    assert res.headers.get("X-LLM-Path") == "primary"


def test_fallback_sets_flag(monkeypatch):
    # Simulate fallback by forcing llm_mod to set fallback_provider
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    import app.utils.llm as llm_mod

    def fb_call_llm(*, model, messages, temperature=0.2, top_p=0.9):
        # simulate that the inner call fell back to openai
        llm_mod.reset_fallback_provider()
        # pretend the inner client set openai fallback

        try:
            # Access private var via helper for test behavior
            llm_mod._fallback_provider.set("openai")  # type: ignore[attr-defined]
        except Exception:
            pass
        return "ok", []

    monkeypatch.setattr(llm_mod, "call_local_llm", fb_call_llm)
    res = client.post("/agent/chat", json=_body())
    assert res.status_code == 200
    j = res.json()
    assert j.get("fallback") == "openai"
    assert res.headers.get("X-LLM-Path") == "fallback-openai"
