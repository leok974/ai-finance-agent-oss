from __future__ import annotations
from contextvars import ContextVar
from typing import Optional

# Per-request correlation id set by RequestLogMiddleware
request_id: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


def get_request_id() -> Optional[str]:
    try:
        return request_id.get()
    except LookupError:
        return None
