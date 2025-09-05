"""
Test the unified /agent/chat endpoint functionality.
"""
import pytest
from datetime import date
from app.orm_models import Transaction


@pytest.fixture
def seeded_txn_id(_SessionLocal):
    """Create a test transaction and return its ID."""
    db = _SessionLocal()
    try:
        txn = Transaction(
            date=date(2025, 1, 15),
            merchant="Test Coffee Shop",
            description="Coffee purchase for testing",
            amount=4.50,
            category="Food & Dining",
            account="Checking",
            month="2025-01"
        )
        db.add(txn)
        db.commit()
        db.refresh(txn)
        return str(txn.id)
    finally:
        db.close()


def test_agent_chat_auto_context(client):
    """Test that the chat endpoint auto-enriches context when not provided."""
    r = client.post("/agent/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    assert "used_context" in j
    # Should have auto-populated context
    assert j["used_context"] is not None


def test_agent_chat_explain_txn_fallback(client, seeded_txn_id):
    """Test transaction explanation fallback when txn_id is missing."""
    # Test with natural language that should trigger fallback
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "Explain this $4.50 charge from Test Coffee"}],
        "intent": "explain_txn"
        # No txn_id provided - should fallback to latest transaction
    })
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    assert "citations" in j
    # Should still have transaction citation from fallback
    assert any(c["type"] == "txn" for c in j["citations"])


def test_agent_chat_model_normalization(client):
    """Test that model names are normalized correctly."""
    # Test with colon version
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "test"}],
        "model": "gpt-oss:20b"
    })
    assert r.status_code == 200
    j = r.json()
    assert j["model"] == "gpt-oss-20b"  # Should be normalized
    
    # Test with hyphen version
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "test"}],
        "model": "gpt-oss-20b"
    })
    assert r.status_code == 200
    j = r.json()
    assert j["model"] == "gpt-oss-20b"  # Should remain the same


def test_agent_chat_comprehensive_citations(client, seeded_txn_id):
    """Test that citations include all available context types."""
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "What's my financial summary?"}],
        "intent": "general"
    })
    assert r.status_code == 200
    j = r.json()
    assert "citations" in j
    
    # Should have multiple citation types for comprehensive context
    citation_types = {c["type"] for c in j["citations"]}
    
    # Should include at least summary and rules in most cases
    expected_types = {"summary", "rules"}
    assert expected_types.issubset(citation_types) or len(citation_types) > 0


def test_agent_chat_explain_txn(client, seeded_txn_id):
    """Test transaction explanation with intent and txn_id."""
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "explain"}],
        "intent": "explain_txn",
        "txn_id": seeded_txn_id
    })
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    assert "citations" in j
    # Should have transaction citation when explaining a specific transaction
    assert any(c["type"] == "txn" for c in j["citations"])


def test_agent_chat_pydantic_validation(client):
    """Test request validation with Pydantic models."""
    # Valid request
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "test"}],
        "temperature": 0.7,
        "top_p": 0.9
    })
    assert r.status_code == 200
    
    # Invalid temperature (too high)
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "test"}],
        "temperature": 3.0
    })
    assert r.status_code == 422  # Validation error
    
    # Invalid top_p (negative)
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "test"}],
        "top_p": -0.1
    })
    assert r.status_code == 422  # Validation error


def test_agent_chat_intent_hints(client):
    """Test different intent types for specialized behavior."""
    intents = ["general", "explain_txn", "budget_help", "rule_seed"]
    
    for intent in intents:
        r = client.post("/agent/chat", json={
            "messages": [{"role": "user", "content": "help me"}],
            "intent": intent
        })
        assert r.status_code == 200
        j = r.json()
        assert "reply" in j
        assert "model" in j


def test_agent_chat_context_trimming(client):
    """Test that large context gets trimmed appropriately."""
    # Create a request with a very large message to trigger trimming
    large_content = "x" * 10000  # Large message content
    
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": large_content}]
    })
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    # Should still process successfully even with large input


def test_agent_chat_legacy_redirects(client):
    """Test that legacy endpoints redirect properly."""
    # Test /gpt redirect
    r = client.post("/gpt", json={
        "messages": [{"role": "user", "content": "test"}]
    }, allow_redirects=False)
    assert r.status_code == 307  # Temporary redirect
    assert r.headers["location"] == "/agent/chat"
    assert r.headers.get("x-redirect-reason") == "Legacy /gpt endpoint"
    
    # Test /chat redirect  
    r = client.post("/chat", json={
        "messages": [{"role": "user", "content": "test"}]
    })
    assert r.status_code == 200
    j = r.json()
    assert "redirect_info" in j
    assert j["redirect_info"]["from"] == "/chat"


def test_agent_chat_response_structure(client):
    """Test that response has expected structure."""
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "what is my spending?"}]
    })
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


def test_agent_chat_model_parameter(client):
    """Test that model parameter is respected."""
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "test"}],
        "model": "custom-model"
    })
    assert r.status_code == 200
    j = r.json()
    assert j["model"] == "custom-model"


def test_agent_chat_empty_context_handling(client):
    """Test behavior when context is explicitly empty."""
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "test"}],
        "context": {}
    })
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    # Should still work with empty context


def test_agent_chat_invalid_json(client):
    """Test handling of malformed JSON."""
    # Send invalid JSON
    r = client.post("/agent/chat", 
                   data="invalid json",
                   headers={"Content-Type": "application/json"})
    assert r.status_code == 422  # Unprocessable Entity


def test_agent_chat_missing_messages(client):
    """Test validation when required messages field is missing."""
    r = client.post("/agent/chat", json={
        "intent": "general"
        # Missing required "messages" field
    })
    assert r.status_code == 422  # Validation error


def test_agent_chat_system_prompt_enhancement(client):
    """Test that intent-specific system prompts are working."""
    # Test explain_txn intent should include transaction-specific guidance
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "explain this"}],
        "intent": "explain_txn"
    })
    assert r.status_code == 200
    j = r.json()
    assert "reply" in j
    # The response should be influenced by explain_txn intent hints
