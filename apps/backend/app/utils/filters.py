import hashlib
import json
from typing import Any, Dict

def hash_filters(filters: Dict[str, Any] | None) -> str:
    if not filters:
        return "none"
    try:
        payload = json.dumps(filters, sort_keys=True, separators=(",", ":"))
    except Exception:
        return "none"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]
