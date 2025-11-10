"""DevDiag client for LedgerMind backend.

Provides async HTTP client for mcp-devdiag quickcheck API.
"""

from __future__ import annotations

import os
import httpx
from typing import Any


DEVDIAG_BASE = os.getenv("DEVDIAG_BASE", "http://localhost:8023")
DEVDIAG_JWT = os.getenv("DEVDIAG_JWT", "")  # service token (optional)

_HEADERS = {"Content-Type": "application/json"}
if DEVDIAG_JWT:
    _HEADERS["Authorization"] = f"Bearer {DEVDIAG_JWT}"


async def quickcheck(
    url: str, preset: str = "app", tenant: str = "ledgermind"
) -> dict[str, Any]:
    """Run a DevDiag quickcheck against a target URL.

    Args:
        url: Absolute URL to probe (e.g., "https://app.ledger-mind.org")
        preset: Diagnostic preset - one of: app, embed, chat, full
        tenant: Tenant identifier for learning loop

    Returns:
        DevDiag response dict with diagnostic results

    Raises:
        httpx.HTTPStatusError: If DevDiag API returns error status
        httpx.TimeoutException: If request exceeds timeout
    """
    payload = {
        "url": url,
        "preset": preset,
        "tenant": tenant,
    }

    timeout = httpx.Timeout(20.0, connect=5.0)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        r = await client.post(
            f"{DEVDIAG_BASE}/mcp/diag/quickcheck",
            headers=_HEADERS,
            json=payload,
        )
        r.raise_for_status()
        return r.json()
