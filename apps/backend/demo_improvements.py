"""
Demo script to test the new agent chat improvements:
1. Transaction explanation fallback
2. Model name normalization
3. Comprehensive citations
"""

import requests

API_BASE = "http://127.0.0.1:8000"


def test_explain_txn_fallback():
    """Test explain_txn intent with natural language (no txn_id)."""
    print("=== Testing Transaction Explanation Fallback ===")

    payload = {
        "messages": [{"role": "user", "content": "Explain this $4.50 coffee charge"}],
        "intent": "explain_txn",
        # No txn_id - should fallback to latest transaction
    }

    response = requests.post(f"{API_BASE}/agent/chat", json=payload)
    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        print(f"Reply: {result['reply'][:200]}...")
        print(f"Citations: {result['citations']}")
        print(f"Model: {result['model']}")
    else:
        print(f"Error: {response.text}")
    print()


def test_model_normalization():
    """Test model name normalization."""
    print("=== Testing Model Normalization ===")

    # Test colon version
    payload = {
        "messages": [{"role": "user", "content": "Hello"}],
        "model": "gpt-oss:20b",
    }

    response = requests.post(f"{API_BASE}/agent/chat", json=payload)
    print("Input model: gpt-oss:20b")

    if response.status_code == 200:
        result = response.json()
        print(f"Output model: {result['model']}")
    else:
        print(f"Error: {response.text}")
    print()


def test_comprehensive_citations():
    """Test comprehensive citations generation."""
    print("=== Testing Comprehensive Citations ===")

    payload = {
        "messages": [{"role": "user", "content": "What's my spending summary?"}],
        "intent": "general",
    }

    response = requests.post(f"{API_BASE}/agent/chat", json=payload)
    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        print(f"Citations count: {len(result['citations'])}")
        for citation in result["citations"]:
            if "count" in citation:
                print(f"  - {citation['type']}: {citation['count']} items")
            else:
                print(f"  - {citation['type']}: ID {citation.get('id', 'N/A')}")
    else:
        print(f"Error: {response.text}")
    print()


if __name__ == "__main__":
    try:
        test_explain_txn_fallback()
        test_model_normalization()
        test_comprehensive_citations()
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to API server at http://127.0.0.1:8000")
        print("Make sure the backend server is running!")
