"""
LLM Health Check Service
Provides unified health probe for Ollama/NIM that matches actual LLM client configuration.
"""

import httpx
import time
from typing import Dict, Any
from ..config import OPENAI_BASE_URL, OLLAMA_BASE_URL
import os


# Simple TTL cache to avoid hammering LLM
_health_cache: Dict[str, Any] = {"timestamp": 0.0, "ok": False, "reason": None}
CACHE_TTL_SECONDS = 5.0


async def ping_llm(timeout_s: float = 2.0, use_cache: bool = True) -> Dict[str, Any]:
    """
    Health check that uses the same base URL as the actual LLM client.

    Returns:
        {
            "ok": bool,          # True if LLM is reachable
            "reason": str|None,  # Error reason if ok=False
            "provider": str,     # "ollama" or "nim"
            "base_url": str,     # The URL that was probed
            "cached": bool       # True if result from cache
        }
    """
    global _health_cache

    now = time.time()
    if use_cache and (now - _health_cache["timestamp"]) < CACHE_TTL_SECONDS:
        return {
            "ok": _health_cache["ok"],
            "reason": _health_cache["reason"],
            "provider": _health_cache.get("provider", "unknown"),
            "base_url": _health_cache.get("base_url", ""),
            "cached": True,
        }

    # Determine provider (default to ollama)
    provider = os.getenv("DEFAULT_LLM_PROVIDER", "ollama").lower()

    # Use the same base URL as the LLM client
    if provider == "nim":
        base_url = OPENAI_BASE_URL.rstrip("/")
        probe_path = "/v1/models"  # Standard OpenAI-compatible endpoint
    else:
        # Ollama: prefer OLLAMA_BASE_URL if set, otherwise OPENAI_BASE_URL
        base_url = (OLLAMA_BASE_URL or OPENAI_BASE_URL).rstrip("/")
        probe_path = "/api/tags"  # Ollama-specific endpoint

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.get(f"{base_url}{probe_path}")

            if response.status_code == 200:
                # Additional validation: check for expected response structure
                try:
                    data = response.json()
                    if provider == "ollama" and "models" in data:
                        ok = True
                        reason = None
                    elif provider == "nim" and "data" in data:
                        ok = True
                        reason = None
                    else:
                        ok = False
                        reason = f"Unexpected response structure: {list(data.keys())}"
                except Exception as e:
                    ok = False
                    reason = f"Invalid JSON response: {str(e)}"
            else:
                ok = False
                reason = f"HTTP {response.status_code}"

    except httpx.TimeoutException:
        ok = False
        reason = "Timeout"
    except httpx.ConnectError as e:
        ok = False
        reason = f"Connection refused: {str(e)}"
    except Exception as e:
        ok = False
        reason = f"Error: {str(e)}"

    # Update cache
    _health_cache = {
        "timestamp": now,
        "ok": ok,
        "reason": reason,
        "provider": provider,
        "base_url": base_url,
    }

    return {
        "ok": ok,
        "reason": reason,
        "provider": provider,
        "base_url": base_url,
        "cached": False,
    }


def clear_health_cache():
    """Force next health check to re-probe (useful for tests)."""
    global _health_cache
    _health_cache = {"timestamp": 0.0, "ok": False, "reason": None}


async def is_llm_available(use_cache: bool = True) -> bool:
    """
    Simple boolean check for LLM availability.
    Convenience wrapper around ping_llm() for use in route handlers.

    Can be overridden with LM_LLM_FORCE_PRIMARY=1 environment variable.
    """
    import os

    # Allow forcing primary path (useful for demos with flaky health probes)
    if os.getenv("LM_LLM_FORCE_PRIMARY") == "1":
        return True

    result = await ping_llm(use_cache=use_cache)
    return result["ok"]
