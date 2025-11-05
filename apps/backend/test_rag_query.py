import httpx
import json

resp = httpx.post(
    "http://localhost:8000/agent/rag/query",
    json={"q": "How do credit card rewards work?", "k": 3},
    timeout=30.0,
)
print(f"Status: {resp.status_code}")
result = json.loads(resp.text)
print(f"Found {len(result.get('results', []))} results")
for i, r in enumerate(result.get("results", [])[:3], 1):
    doc_url = r.get("url", "N/A")
    chunk = r.get("chunk_idx", "?")
    score = r.get("score", 0)
    content = r.get("content", "")[:80]
    print(f"{i}. {doc_url.split('/')[-1]} chunk {chunk}, score {score:.3f}")
    print(f"   {content}...")
