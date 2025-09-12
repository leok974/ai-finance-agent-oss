"""
Quick test of hermetic agent chat functionality
"""
import sys
import os
sys.path.insert(0, os.path.abspath('.'))

from fastapi.testclient import TestClient
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
        response = client.post("/agent/chat", json={
            "messages": [{"role": "user", "content": "hello test"}],
            "intent": "general"
        })
        
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            result = response.json()
            print("✅ Chat endpoint working!")
            print(f"Reply: {result.get('reply', 'N/A')}")
            print(f"Citations: {len(result.get('citations', []))}")
            print(f"Model: {result.get('model', 'N/A')}")
            return True
        else:
            print(f"❌ Error: {response.status_code} - {response.text}")
            return False
    finally:
        # Restore original function
        llm_mod.call_local_llm = original_call_local_llm

if __name__ == "__main__":
    print("Testing hermetic agent chat...")
    success = test_basic_chat()
    print("✅ Test passed!" if success else "❌ Test failed!")
