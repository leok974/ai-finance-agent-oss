"""
Test script to demonstrate the token-safe context trimming and PII redaction features.
"""
import json
from typing import Dict, Any

# Simulate the functions from the agent router
SENSITIVE_KEYS = {"content", "merchant", "description", "account_number", "address", "phone", "email"}

def redact_pii(d):
    """Recursively redact sensitive information from data structures for logging."""
    if isinstance(d, dict):
        return {k: ("[redacted]" if k in SENSITIVE_KEYS else redact_pii(v)) for k, v in d.items()}
    if isinstance(d, list):
        return [redact_pii(x) for x in d]
    return d

def estimate_tokens(text: str) -> int:
    """Rough token estimation: ~4 chars per token for English text."""
    return len(text) // 4

def trim_ctx_for_prompt(ctx: dict, max_chars: int = 8000) -> dict:
    """Smart context trimming that drops lowest-value fields first."""
    trim_order = ["suggestions", "top_merchants", "insights", "alerts", "rules"]
    calc_size = lambda d: len(json.dumps(d, default=str))
    
    if calc_size(ctx) <= max_chars:
        return ctx
    
    trimmed = dict(ctx)
    
    for field in trim_order:
        if field in trimmed:
            if isinstance(trimmed[field], list):
                # For lists, trim to half size first
                original_len = len(trimmed[field])
                trimmed[field] = trimmed[field][:max(1, original_len // 2)]
                
                # If still too big, remove entirely
                if calc_size(trimmed) > max_chars:
                    del trimmed[field]
            else:
                # For non-lists, remove entirely
                del trimmed[field]
            
            # Check if we're under the limit now
            if calc_size(trimmed) <= max_chars:
                break
    
    return trimmed

# Test data with PII
test_context = {
    "month": "2024-12",
    "summary": {"income": 5000, "expenses": 3500, "net": 1500},
    "txn": {
        "id": 123,
        "merchant": "Starbucks on Main St",
        "description": "Coffee purchase with card ending 1234",
        "amount": -4.50,
        "account_number": "1234-5678-9012-3456"
    },
    "rules": [
        {"id": 1, "merchant": "Starbucks", "category": "Dining"},
        {"id": 2, "merchant": "Shell Gas Station", "category": "Transport"}
    ] * 20,  # Make it large
    "top_merchants": [
        {"merchant": "Amazon", "amount": 250},
        {"merchant": "Whole Foods Market", "amount": 180}
    ] * 50,  # Make it large
    "insights": {"trend": "spending up 15% vs last month"} * 100,  # Make it large
    "suggestions": ["Consider budgeting for coffee expenses"] * 200,  # Make it large
    "alerts": ["High spending detected"] * 30  # Make it large
}

if __name__ == "__main__":
    print("=== PII Redaction Test ===")
    print("Original data:")
    print(json.dumps(test_context["txn"], indent=2))
    print("\nRedacted data:")
    print(json.dumps(redact_pii(test_context["txn"]), indent=2))
    
    print("\n=== Context Trimming Test ===")
    original_size = len(json.dumps(test_context, default=str))
    original_tokens = estimate_tokens(json.dumps(test_context, default=str))
    print(f"Original context: {original_size} chars (~{original_tokens} tokens)")
    
    trimmed = trim_ctx_for_prompt(test_context, max_chars=2000)  # Small limit for demo
    trimmed_size = len(json.dumps(trimmed, default=str))
    trimmed_tokens = estimate_tokens(json.dumps(trimmed, default=str))
    print(f"Trimmed context: {trimmed_size} chars (~{trimmed_tokens} tokens)")
    
    print(f"\nFields retained: {list(trimmed.keys())}")
    print(f"Fields removed: {set(test_context.keys()) - set(trimmed.keys())}")
    
    # Show size of remaining arrays
    for k, v in trimmed.items():
        if isinstance(v, list):
            original_len = len(test_context.get(k, []))
            current_len = len(v)
            print(f"  {k}: {original_len} → {current_len} items")
