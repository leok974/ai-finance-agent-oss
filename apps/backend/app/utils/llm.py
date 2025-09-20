from __future__ import annotations
from typing import List, Dict, Tuple, Optional
import os, requests, time, random, email.utils as eut
from app.utils.request_ctx import get_request_id
from app.config import settings

def _parse_retry_after(v: Optional[str]) -> Optional[float]:
    if not v:
        return None
    try:
        return float(v)
    except Exception:
        try:
            dt = eut.parsedate_to_datetime(v)
            return max(0.0, (dt.timestamp() - time.time()))
        except Exception:
            return None


def _post_chat(base: str, key: str, payload: dict, timeout: int = 60) -> dict:
    root = base.rstrip('/')
    # Ensure we use OpenAI-style /v1 path exactly once
    if not root.endswith('/v1'):
        root = f"{root}/v1"
    url = f"{root}/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    rid = get_request_id()
    delays = [1.5, 3.0, 6.0, 0.0]
    total_wait = 0.0
    max_attempts = 4
    attempt = 0
    while True:
        r = requests.post(url, json=payload, headers=headers, timeout=timeout)
        if r.status_code == 429:
            ra = _parse_retry_after(r.headers.get("Retry-After"))
            base = delays[attempt] if attempt < len(delays) else delays[-1]
            wait = ra if (ra is not None and ra > 0) else base
            wait = min(8.0, wait + random.uniform(0, max(0.0, wait * 0.4)))
            if attempt >= (max_attempts - 1) or (total_wait + wait > 15.0):
                # graceful fallback: mimic minimal OpenAI-like shape
                return {"choices":[{"message":{"role":"assistant","content":"I'm temporarily over capacity. Please retry in a moment."}}]}
            try:
                print({"evt":"llm.retry","rid":rid,"attempt":attempt+1,"status":429,"retry_after":ra,"wait":round(wait,2)})
            except Exception:
                pass
            time.sleep(wait)
            total_wait += wait
            attempt += 1
            continue
        if r.status_code == 404:
            raise RuntimeError(f"LLM HTTP error 404: {r.text}")
        r.raise_for_status()
        return r.json()

def call_llm(*, model: str, messages: List[Dict[str,str]], temperature: float=0.2, top_p: float=0.9) -> Tuple[str, list]:
    """
    Provider-agnostic chat call. Uses OpenAI-compatible Chat Completions:
    - provider='ollama'  -> your local shim (e.g., http://localhost:11434/v1)
    - provider='openai'  -> https://api.openai.com/v1 (requires real OPENAI_API_KEY)
    """

    # Use configured base URL and key regardless of provider; provider flag is kept for future branching
    base = settings.OPENAI_BASE_URL
    key  = settings.OPENAI_API_KEY

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
    }

    data = _post_chat(base, key, payload)
    try:
        reply = data["choices"][0]["message"]["content"]
    except Exception:
        # If fallback dict sneaks through a different shape, provide a generic message
        reply = "I'm temporarily over capacity. Please retry in a moment."
    return reply, data.get("tool_trace", [])

# Back-compat for existing tests that monkeypatch call_local_llm
def call_local_llm(*args, **kwargs):
    return call_llm(*args, **kwargs)

def list_models() -> Dict[str, List[Dict[str, str]]]:
    """
    Return available model names for the configured provider.
    Shape:
    {
      "provider": "ollama" | "openai",
      "default": "<settings.DEFAULT_LLM_MODEL>",
      "models": [{"id":"<name>"}, ...]
    }
    """
    provider = (settings.DEFAULT_LLM_PROVIDER or "ollama").lower()
    base_openai = settings.OPENAI_BASE_URL
    base_ollama = getattr(settings, "OLLAMA_BASE_URL", "http://ollama:11434")
    key = settings.OPENAI_API_KEY

    if provider == "ollama":
        root = base_ollama.rstrip('/')
        url = f"{root}/api/tags"
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        # data = {"models":[{"name":"llama3.1:8b", ...}, ...]}
        models = [{"id": m.get("name")} for m in data.get("models", []) if m.get("name")]
        return {"provider": provider, "default": settings.DEFAULT_LLM_MODEL, "models": models}

    # OpenAI (or any OpenAI-compatible host)
    url = f"{base_openai.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {key}"}
    r = requests.get(url, headers=headers, timeout=15)
    r.raise_for_status()
    data = r.json()
    # data = {"object":"list","data":[{"id":"gpt-5", ...}, ...]}
    models = [{"id": m.get("id")} for m in data.get("data", []) if m.get("id")]
    return {"provider": provider, "default": settings.DEFAULT_LLM_MODEL, "models": models}
