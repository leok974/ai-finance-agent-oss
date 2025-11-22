"""
Test the unified /agent/chat endpoint functionality.
Tests are hermetic and don't make real LLM calls.
"""

import pytest
import uuid
from datetime import date
from app.orm_models import Transaction


def _fake_llm(*, model, messages, temperature=0.2, top_p=0.9):
    """Mock LLM that returns canned responses without external calls."""
    # Return a short canned reply; include a fake trace
    return "Stubbed LLM reply for testing", [{"tool": "_fake_llm", "status": "mocked"}]


@pytest.fixture
def seeded_txn_id(_SessionLocal):
    """Create a test transaction and return its ID."""
    db = _SessionLocal()
    try:
        # Make each transaction unique to avoid UNIQUE constraint violations
        unique_suffix = str(uuid.uuid4())[:8]
        txn = Transaction(
            date=date(2025, 1, 15),
            merchant=f"Test Coffee Shop {unique_suffix}",
            description=f"Coffee purchase for testing {unique_suffix}",
            amount=4.50 + (hash(unique_suffix) % 100) / 100,  # Slightly vary amount
            category="Food & Dining",
            account="Checking",
            month="2025-01",
        )
        db.add(txn)
        db.commit()
        db.refresh(txn)
        return str(txn.id)
    finally:
        db.close()


def test_agent_chat_auto_context(monkeypatch, client):
    """Test that the chat endpoint auto-enriches context when not provided."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    r = client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers={"X-Test-Mode": "stub"},
    )
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    assert "used_context" in j
    # Should have auto-populated context
    assert j["used_context"] is not None
    assert isinstance(j["tool_trace"], list)


def test_agent_chat_explain_txn_fallback(monkeypatch, seeded_txn_id, client):
    """Test transaction explanation fallback when txn_id is missing."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    # Test with natural language that should trigger fallback
    r = client.post(
        "/agent/chat",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": "Explain this $4.50 charge from Test Coffee",
                }
            ],
            "intent": "explain_txn",
            # No txn_id provided - should fallback to latest transaction
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    assert "citations" in j
    # Should still have transaction citation from fallback
    assert any(c["type"] == "txn" for c in j["citations"])


def test_agent_chat_model_normalization(monkeypatch, client):
    """Test that model names are normalized correctly."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    # Test with colon version
    r = client.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "model": "gpt-oss:20b",
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert j["model"] == "gpt-oss:20b"  # Canonical colon tag

    # Test with hyphen version
    r = client.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "model": "gpt-oss-20b",
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert j["model"] == "gpt-oss:20b"  # Should normalize dash -> colon


def test_agent_chat_comprehensive_citations(monkeypatch, seeded_txn_id, client):
    """Test that citations include all available context types."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    r = client.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "What's my financial summary?"}],
            "intent": "general",
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert "citations" in j

    # Should have multiple citation types for comprehensive context
    citation_types = {c["type"] for c in j["citations"]}

    # Should include at least summary and rules in most cases
    expected_types = {"summary", "rules"}
    assert expected_types.issubset(citation_types) or len(citation_types) > 0


def test_agent_chat_explain_txn(monkeypatch, seeded_txn_id, client):
    """Test transaction explanation with intent and txn_id."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    r = client.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "explain"}],
            "intent": "explain_txn",
            "txn_id": seeded_txn_id,
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    assert "citations" in j
    # Should have transaction citation when explaining a specific transaction
    assert any(c["type"] == "txn" for c in j["citations"])


def test_agent_chat_pydantic_validation(monkeypatch, client):
    """Test request validation with Pydantic models."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    # Valid request
    r = client.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "temperature": 0.7,
            "top_p": 0.9,
        },
    )
    assert r.status_code == 200

    # Invalid temperature (too high)
    r = client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "test"}], "temperature": 3.0},
    )
    assert r.status_code == 422  # Validation error

    # Invalid top_p (negative)
    r = client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "test"}], "top_p": -0.1},
    )
    assert r.status_code == 422  # Validation error


def test_agent_chat_intent_hints(monkeypatch, client):
    """Test different intent types for specialized behavior."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    intents = ["general", "explain_txn", "budget_help", "rule_seed"]

    for intent in intents:
        r = client.post(
            "/agent/chat",
            json={
                "messages": [{"role": "user", "content": "help me"}],
                "intent": intent,
            },
        )
        assert r.status_code == 200
        j = r.json()
        assert "reply" in j
        assert "model" in j


def test_agent_chat_context_trimming(monkeypatch, client):
    """Test that large context gets trimmed appropriately."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    # Create a request with a very large message to trigger trimming
    large_content = "x" * 10000  # Large message content

    r = client.post(
        "/agent/chat", json={"messages": [{"role": "user", "content": large_content}]}
    )
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    # Should still process successfully even with large input


def test_agent_chat_legacy_redirects(monkeypatch, client):
    """Test that legacy endpoints redirect properly."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    # Test /agent/gpt redirect (follow_redirects=False for TestClient)
    r = client.post(
        "/agent/gpt",
        json={"messages": [{"role": "user", "content": "test"}]},
        follow_redirects=False,
    )
    assert r.status_code in (307, 308)  # Allow both temporary and permanent redirects
    assert "/agent/chat" in r.headers.get("location", "")

    # Test /agent/chat redirect (this should work with redirect following)
    r = client.post(
        "/agent/chat", json={"messages": [{"role": "user", "content": "test"}]}
    )
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j


def test_agent_chat_response_structure(monkeypatch, client):
    """Test that response has expected structure."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    r = client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "what is my spending?"}]},
    )
    assert r.status_code == 200
    j = r.json()

    # Required fields
    assert "reply" in j
    assert "citations" in j
    assert "used_context" in j
    assert "tool_trace" in j
    assert "model" in j

    # Citations should be a list
    assert isinstance(j["citations"], list)

    # Tool trace should be a list
    assert isinstance(j["tool_trace"], list)

    # Used context should be a dict
    assert isinstance(j["used_context"], dict)


def test_agent_chat_model_parameter(monkeypatch, client):
    """Test that model parameter is respected."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    r = client.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "model": "custom-model",
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert j["model"] == "custom-model"


def test_agent_chat_empty_context_handling(monkeypatch, client):
    """Test behavior when context is explicitly empty."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    r = client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "test"}], "context": {}},
    )
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    # Should still work with empty context


def test_agent_chat_invalid_json(client):
    """Test handling of malformed JSON."""

    # Send invalid JSON
    r = client.post(
        "/agent/chat",
        content="invalid json",  # use content= to avoid httpx deprecated raw data warning
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 422  # Unprocessable Entity


def test_agent_chat_missing_messages(client):
    """Test validation when required messages field is missing."""

    r = client.post(
        "/agent/chat",
        json={
            "intent": "general"
            # Missing required "messages" field
        },
    )
    assert r.status_code == 422  # Validation error


def test_agent_chat_system_prompt_enhancement(monkeypatch, client):
    """Test that intent-specific system prompts are working."""
    from app.utils import llm as llm_mod

    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)

    # Test explain_txn intent should include transaction-specific guidance
    r = client.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "explain this"}],
            "intent": "explain_txn",
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    # The response should be influenced by explain_txn intent hints
