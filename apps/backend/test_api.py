#!/usr/bin/env python3
"""Quick test of suggest API endpoint."""

from app.routers.suggestions import suggest, SuggestRequest

# Test with transaction ID 1 (Amazon from golden set)
req = SuggestRequest(txn_ids=[1])
result = suggest(req)

print("✅ API Response:")
print(f"   Items: {len(result.items)}")

if result.items and result.items[0].candidates:
    item = result.items[0]
    top = item.candidates[0]
    print(f"\n✅ Transaction: {item.txn_id}")
    print("✅ Top Candidate:")
    print(f"   Label: {top.label}")
    print(f"   Confidence: {top.confidence:.2f}")
    print(f"   Source: {top.source}")
    print(f"   Model: {top.model_version}")
    if top.reasons:
        print(f"   Reasons: {top.reasons}")
else:
    print("❌ No candidates returned")
