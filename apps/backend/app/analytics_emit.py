import time
import os
import json
import logging
from typing import Dict, Any

log = logging.getLogger("analytics")

# Flags: enable analytics logging and optional DB sink
ANALYTICS_ENABLED = os.getenv("ANALYTICS_ENABLED", "1") not in ("0", "false", "False")
ANALYTICS_DB = os.getenv("ANALYTICS_DB", "0") in ("1", "true", "True")


def emit_fallback(props: Dict[str, Any]) -> None:
    """Fire-and-forget analytics event for LLM fallback.

    Never raises; logs a 'track' line and optionally stores to DB if enabled.
    """
    if not ANALYTICS_ENABLED:
        return
    record = {
        "event": "chat_fallback_used",
        "props": props,
        "client_ts": None,
        "server_ts": int(time.time() * 1000),
        "rid": props.get("rid"),
        "path": "/agent/chat",
        "ip": None,
        "ua": None,
    }
    try:
        log.info("track %s", json.dumps(record, ensure_ascii=False))
    except Exception:
        pass
    if ANALYTICS_DB:
        try:
            from app.services.analytics_sink import store_event

            store_event(record)
        except Exception:
            pass
