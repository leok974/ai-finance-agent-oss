"""Legacy agent chat test.

Marked as httpapi so it's excluded from pure hermetic runs that avoid FastAPI.
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.abspath("."))

pytestmark = pytest.mark.httpapi

if os.getenv("HERMETIC") == "1":
    # Hermetic runs exclude http api tests; ensure import attempt won't cause collection error
    try:  # pragma: no cover
        from fastapi.testclient import TestClient  # type: ignore
        from app.main import app
        from app.utils import llm as llm_mod
    except Exception:
        pytest.skip("Skipping agent chat test in hermetic mode (FastAPI not available)")
else:
    from fastapi.testclient import TestClient  # type: ignore
    from app.main import app
    from app.utils import llm as llm_mod


def _fake_llm(*, model, messages, temperature=0.2, top_p=0.9):
    """Mock LLM that returns canned responses without external calls."""
    return "Test LLM response", [{"tool": "_fake_llm", "status": "mocked"}]


def test_basic_chat():
    """Test basic chat functionality with mocked LLM"""
    # Mock the LLM call
    original_call_local_llm = llm_mod.call_local_llm
    llm_mod.call_local_llm = _fake_llm

    try:
        client = TestClient(app)
        response = client.post(
            "/agent/chat",
            json={
                "messages": [{"role": "user", "content": "hello test"}],
                "intent": "general",
            },
        )

        print(f"Status: {response.status_code}")
        assert (
            response.status_code == 200
        ), f"chat endpoint failed: {response.status_code} - {response.text}"
        result = response.json()
        # Basic shape assertions (avoid over-coupling):
        assert "reply" in result, "missing reply in chat response"
        assert isinstance(result.get("reply"), str)
        # citations optional but if present must be a list
        if "citations" in result:
            assert isinstance(result["citations"], list)
        # model field is optional; if present must be str
        if "model" in result:
            assert isinstance(result["model"], str)
    finally:
        # Restore original function
        llm_mod.call_local_llm = original_call_local_llm


if __name__ == "__main__":
    print("Testing hermetic agent chat...")
    success = test_basic_chat()
    print("✅ Test passed!" if success else "❌ Test failed!")
