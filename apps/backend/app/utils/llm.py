from __future__ import annotations
from typing import List, Dict, Tuple
import os, requests
from app.config import settings

def _post_chat(base: str, key: str, payload: dict, timeout: int = 60) -> dict:
    root = base.rstrip('/')
    # Ensure we use OpenAI-style /v1 path exactly once
    if not root.endswith('/v1'):
        root = f"{root}/v1"
    url = f"{root}/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    r = requests.post(url, json=payload, headers=headers, timeout=timeout)
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
    reply = data["choices"][0]["message"]["content"]
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
    base = settings.OPENAI_BASE_URL
    key = settings.OPENAI_API_KEY

    if provider == "ollama":
        # Ollama tags endpoint uses root (not /v1). Accept both base forms.
        root = base.rstrip('/')
        if root.endswith('/v1'):
            root = root[:-3]  # drop trailing '/v1'
        url = f"{root}/api/tags"
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        # data = {"models":[{"name":"llama3.1:8b", ...}, ...]}
        models = [{"id": m.get("name")} for m in data.get("models", []) if m.get("name")]
        return {"provider": provider, "default": settings.DEFAULT_LLM_MODEL, "models": models}

    # OpenAI (or any OpenAI-compatible host)
    url = f"{base.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {key}"}
    r = requests.get(url, headers=headers, timeout=15)
    r.raise_for_status()
    data = r.json()
    # data = {"object":"list","data":[{"id":"gpt-5", ...}, ...]}
    models = [{"id": m.get("id")} for m in data.get("data", []) if m.get("id")]
    return {"provider": provider, "default": settings.DEFAULT_LLM_MODEL, "models": models}
