#!/usr/bin/env python3
import json
import sys

sys.path.insert(0, "/app")

from app.redis_client import redis

r = redis()
if not r:
    print("Redis not available")
    sys.exit(1)

keys = r.keys("merchant:v1:*")
print(f"Total merchant keys: {len(keys)}")
print("=" * 60)

for key in sorted(keys)[:10]:
    data = r.get(key)
    hint = json.loads(data)
    cat = hint.get("category") or "N/A"
    conf = hint.get("confidence", 0)
    count = hint.get("seen_count", 0)
    print(f'{hint["display_name"]:30} | {cat:15} | conf={conf:.2f} | seen={count}')
