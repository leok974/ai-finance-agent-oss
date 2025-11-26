"""
LLM streaming with local-first provider selection and OpenAI fallback.

This module mirrors the provider fallback logic from call_llm() but for streaming.
"""

from __future__ import annotations
from typing import AsyncIterator, Dict, List
import json
import logging
import httpx

from app.config import settings
from app.utils.request_ctx import get_request_id


_log = logging.getLogger(__name__)


def _get_effective_openai_key() -> str:
    """
    Resolve the OpenAI API key from (in order):
    - OPENAI_API_KEY env var
    - OPENAI_API_KEY_FILE (Docker secret) if present
    - settings.OPENAI_API_KEY (defaults to 'ollama')
    """
    import os
    import os.path

    try:
        k = os.getenv("OPENAI_API_KEY")
        if k and k.strip():
            return k.strip()
        path = os.getenv(
            "OPENAI_API_KEY_FILE",
            getattr(settings, "OPENAI_API_KEY_FILE", "/run/secrets/openai_api_key"),
        )
        if path and os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    k2 = f.read().strip()
                    if k2:
                        return k2
            except Exception:
                pass
        return getattr(settings, "OPENAI_API_KEY", "ollama")
    except Exception:
        return getattr(settings, "OPENAI_API_KEY", "ollama")


def _has_real_openai_key() -> bool:
    """Check if a real OpenAI API key (sk-*) is configured for fallback."""
    try:
        k = _get_effective_openai_key() or ""
        # Treat actual OpenAI-style keys (sk-*) as real; ignore placeholders like 'ollama' or empty
        return isinstance(k, str) and k.startswith("sk-")
    except Exception:
        return False


def _model_for_openai(requested: str) -> str:
    """
    Choose an OpenAI model for fallback.
    Priority:
      1) OPENAI_FALLBACK_MODEL (env)
      2) small mapping for common local names
      3) default 'gpt-4o-mini'
    """
    import os

    env_fallback = os.getenv("OPENAI_FALLBACK_MODEL")
    if env_fallback:
        return env_fallback
    mapping = {
        "gpt-oss:20b": "gpt-4o-mini",
        "gpt-oss:7b": "gpt-4o-mini",
        "llama3.1:8b": "gpt-4o-mini",
        "llama3:8b": "gpt-4o-mini",
        "phi3:3.8b": "gpt-4o-mini",
    }
    return mapping.get(requested, "gpt-4o-mini")


async def _stream_from_local(
    messages: List[Dict[str, str]],
    model: str,
    temperature: float = 0.2,
    top_p: float = 0.9,
) -> AsyncIterator[dict]:
    """
    Stream tokens from your LOCAL model (Ollama / NIM).

    Uses OpenAI-compatible streaming API at OPENAI_BASE_URL.
    """
    base = settings.OPENAI_BASE_URL

    # In container dev/prod, 'localhost' refers to the backend container, not the Ollama service.
    # If default localhost base is still present, rewrite to the OLLAMA_BASE_URL service address.
    try:
        if "localhost:11434" in base and getattr(settings, "OLLAMA_BASE_URL", None):
            ob = settings.OLLAMA_BASE_URL.rstrip("/")
            if ob.endswith(":11434"):
                base = ob + "/v1"
    except Exception:
        pass

    root = base.rstrip("/")
    if not root.endswith("/v1"):
        root = f"{root}/v1"
    url = f"{root}/chat/completions"

    key = _get_effective_openai_key()

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "stream": True,
    }

    headers = {
        "Content-Type": "application/json",
    }
    
    # Only add Authorization header if we have a real key (not the 'ollama' placeholder)
    if key and key != "ollama":
        headers["Authorization"] = f"Bearer {key}"

    rid = get_request_id() or "-"
    _log.info("llm_stream.local start rid=%s base=%s model=%s url=%s", rid, base, model, url)

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=60.0)) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as res:
                res.raise_for_status()

                async for line in res.aiter_lines():
                    if not line:
                        continue

                    # Skip SSE comments
                    if line.startswith(":"):
                        continue

                    # Parse data: prefix
                    if line.startswith("data: "):
                        data_str = line[6:]

                        # [DONE] marker
                        if data_str.strip() == "[DONE]":
                            break

                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content")

                            if content:
                                yield {
                                    "type": "token",
                                    "data": {"text": content},
                                }

                        except json.JSONDecodeError:
                            continue

        _log.info("llm_stream.local success rid=%s", rid)
    except httpx.HTTPStatusError as http_err:
        _log.error(
            "llm_stream.local HTTP error rid=%s status=%s url=%s error=%s",
            rid,
            http_err.response.status_code,
            url,
            str(http_err)
        )
        raise
    except httpx.ConnectError as conn_err:
        _log.error(
            "llm_stream.local connection refused rid=%s url=%s error=%s",
            rid,
            url,
            str(conn_err)
        )
        raise
    except Exception as exc:
        _log.error(
            "llm_stream.local unexpected error rid=%s url=%s error=%s",
            rid,
            url,
            str(exc)
        )
        raise


async def _stream_from_openai(
    messages: List[Dict[str, str]],
    model: str,
    temperature: float = 0.2,
    top_p: float = 0.9,
) -> AsyncIterator[dict]:
    """
    Stream tokens from OpenAI (cloud fallback).
    """
    key = _get_effective_openai_key()
    fallback_model = _model_for_openai(model)

    url = "https://api.openai.com/v1/chat/completions"

    payload = {
        "model": fallback_model,
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    rid = get_request_id() or "-"
    _log.info(
        "llm_stream.openai start rid=%s model=%s (fallback for %s)",
        rid,
        fallback_model,
        model,
    )

    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=60.0)) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as res:
            res.raise_for_status()

            async for line in res.aiter_lines():
                if not line:
                    continue

                # Skip SSE comments
                if line.startswith(":"):
                    continue

                # Parse data: prefix
                if line.startswith("data: "):
                    data_str = line[6:]

                    # [DONE] marker
                    if data_str.strip() == "[DONE]":
                        break

                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content")

                        if content:
                            yield {
                                "type": "token",
                                "data": {"text": content},
                            }

                    except json.JSONDecodeError:
                        continue

    _log.info("llm_stream.openai success rid=%s", rid)


async def stream_llm_tokens_with_fallback(
    messages: List[Dict[str, str]],
    model: str,
    temperature: float = 0.2,
    top_p: float = 0.9,
) -> AsyncIterator[dict]:
    """
    Try local provider first, then fallback to OpenAI if local fails.

    Yields dicts in the NDJSON event format expected by /agent/stream:
    { "type": "token", "data": { "text": "..." } }

    Provider selection:
    - Primary: Ollama/NIM via OPENAI_BASE_URL (local inference)
    - Fallback: OpenAI API (requires sk-* key)

    This mirrors the fallback logic in call_llm() from app.utils.llm.
    """
    rid = get_request_id() or "-"

    # Determine provider order (local-first unless explicitly disabled)
    provider_order = ["local"]
    if _has_real_openai_key():
        provider_order.append("openai")

    last_error: Exception | None = None

    for provider in provider_order:
        try:
            _log.info("llm_stream.attempt provider=%s rid=%s", provider, rid)

            if provider == "local":
                async for event in _stream_from_local(
                    messages, model, temperature, top_p
                ):
                    yield event
            else:  # openai
                async for event in _stream_from_openai(
                    messages, model, temperature, top_p
                ):
                    yield event

            # If we reach here without exception, provider worked – stop fallback chain
            _log.info("llm_stream.success provider=%s rid=%s", provider, rid)
            return

        except Exception as exc:
            _log.warning(
                "llm_stream.provider_failed provider=%s rid=%s error=%s",
                provider,
                rid,
                str(exc),
            )
            last_error = exc
            continue

    # All providers failed
    _log.error("llm_stream.all_failed rid=%s error=%s", rid, str(last_error))
    raise RuntimeError(f"All LLM providers failed for streaming: {last_error}")
