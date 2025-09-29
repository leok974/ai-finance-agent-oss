from __future__ import annotations
from typing import List, Dict, Tuple, Optional, Any
import os, requests, time, random, email.utils as eut
import logging

# --- LLM timeout / warming configuration --------------------------------------
# These env-driven knobs allow the first cold model load (large weights) to avoid
# surfacing an opaque 500. Instead we retry once (optional) and if still timing
# out within the warm window we return a friendly 503 model_warming signal.
try:
    LLM_CONNECT_TIMEOUT = float(os.getenv("LLM_CONNECT_TIMEOUT", "10"))
except Exception:
    LLM_CONNECT_TIMEOUT = 10.0
try:
    LLM_READ_TIMEOUT = float(os.getenv("LLM_READ_TIMEOUT", "45"))  # was 15
except Exception:
    LLM_READ_TIMEOUT = 45.0
try:
    LLM_INITIAL_RETRY = int(os.getenv("LLM_INITIAL_RETRY", "1"))  # 0/1
except Exception:
    LLM_INITIAL_RETRY = 1
try:
    LLM_WARM_WINDOW_S = float(os.getenv("LLM_WARM_WINDOW_S", "60"))
except Exception:
    LLM_WARM_WINDOW_S = 60.0

_PROCESS_START_TS = time.time()
_log = logging.getLogger(__name__)
from app.utils.request_ctx import get_request_id
from app.config import settings
import os
import os.path
from contextvars import ContextVar

# Track fallback provider per-request
_fallback_provider: ContextVar[Optional[str]] = ContextVar("_fallback_provider", default=None)

def get_last_fallback_provider() -> Optional[str]:
    try:
        return _fallback_provider.get()
    except Exception:
        return None

def reset_fallback_provider() -> None:
    """Clear the per-request fallback provider marker.

    This avoids bleed-through across multiple LLM calls within a single request
    or between different code paths that might also consult the flag.
    """
    try:
        _fallback_provider.set(None)
    except Exception:
        pass

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


def _post_chat(base: str, key: str, payload: dict, timeout: int = 60, *, _attempt: int = 0) -> dict:
    """POST a chat completion to an OpenAI-compatible endpoint with limited retry on 429.

    Behavior:
    - 2xx: return parsed JSON immediately
    - 429: honor Retry-After or use backoff, then retry (bounded)
    - 404: raise HTTPError (caller can decide whether to fallback)
    - other 4xx/5xx: raise HTTPError via raise_for_status
    - network/timeouts: bubble up requests.RequestException
    """
    root = base.rstrip('/')
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
        # Let connection/timeout errors bubble up for caller to handle
        # Use separate connect/read timeouts for better early-fail behavior.
        eff_timeout = (LLM_CONNECT_TIMEOUT, min(timeout, LLM_READ_TIMEOUT))
        r = requests.post(url, json=payload, headers=headers, timeout=eff_timeout)
        if r.status_code == 429:
            ra = _parse_retry_after(r.headers.get("Retry-After"))
            base_delay = delays[attempt] if attempt < len(delays) else delays[-1]
            wait = ra if (ra is not None and ra > 0) else base_delay
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
            # Surface as HTTPError so caller's catch can evaluate fallback
            http_err = requests.HTTPError(f"LLM HTTP error 404: {r.text}")
            http_err.response = r
            raise http_err
        # For all other cases, raise if not OK, else return
        r.raise_for_status()
        return r.json()

def _model_for_openai(requested: str) -> str:
    """
    Choose an OpenAI model for fallback.
    Priority:
      1) OPENAI_FALLBACK_MODEL (env)
      2) small mapping for common local names
      3) default 'gpt-4o-mini'
    """
    env_fallback = os.getenv("OPENAI_FALLBACK_MODEL")
    if env_fallback:
        return env_fallback
    mapping = {
        "gpt-oss:20b": "gpt-4o-mini",
        "gpt-oss:7b":  "gpt-4o-mini",
        "llama3.1:8b": "gpt-4o-mini",
        "llama3:8b":   "gpt-4o-mini",
        "phi3:3.8b":   "gpt-4o-mini",
    }
    return mapping.get(requested, "gpt-4o-mini")

def _get_effective_openai_key() -> str:
    """
    Resolve the OpenAI API key from (in order):
    - OPENAI_API_KEY env var
    - OPENAI_API_KEY_FILE (Docker secret) if present
    - settings.OPENAI_API_KEY (defaults to 'ollama')
    """
    try:
        k = os.getenv("OPENAI_API_KEY")
        if k and k.strip():
            return k.strip()
        path = os.getenv("OPENAI_API_KEY_FILE", getattr(settings, "OPENAI_API_KEY_FILE", "/run/secrets/openai_api_key"))
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


def call_llm(*, model: str, messages: List[Dict[str,str]], temperature: float=0.2, top_p: float=0.9) -> Tuple[str, list]:
    """
    Provider-agnostic chat call. Uses OpenAI-compatible Chat Completions:
    - provider='ollama'  -> your local shim (e.g., http://localhost:11434/v1)
    - provider='openai'  -> https://api.openai.com/v1 (requires real OPENAI_API_KEY)

        Fallback behavior:
        - Primary call goes to the configured base (typically Ollama via OPENAI_BASE_URL pointing at an OpenAI-compatible shim).
        - On transient transport/timeout/5xx errors, we fallback to api.openai.com if and only if an OPENAI_API_KEY is configured.
            This intentionally relaxes previous gating that required OPENAI_BASE_URL to already be api.openai.com to enable fallback.
            If the provided key is invalid, the fallback attempt will gracefully degrade to a friendly message.
    """

    # Use configured base URL and key regardless of provider; provider flag is kept for future branching
    base = settings.OPENAI_BASE_URL
    # In container dev/prod, 'localhost' refers to the backend container, not the Ollama service.
    # If default localhost base is still present, rewrite to the OLLAMA_BASE_URL service address.
    try:
        if 'localhost:11434' in base and getattr(settings, 'OLLAMA_BASE_URL', None):
            ob = settings.OLLAMA_BASE_URL.rstrip('/')
            if ob.endswith(':11434'):
                base = ob + '/v1'
    except Exception:
        pass
    key  = _get_effective_openai_key()

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "top_p": top_p,
    }
    try:
        rid = get_request_id() or "-"
        _log.info("LLM:call start rid=%s base=%s model=%s msgs=%d", rid, base, model, len(messages))
    except Exception:
        pass

    # Reset fallback flag at the start of each call
    try:
        _fallback_provider.set(None)
    except Exception:
        pass

    # First try: Ollama or configured base with tighter timeout and friendly errors
    def _try_ollama_native() -> Optional[dict]:
        """Attempt Ollama native endpoints when OpenAI chat path is not available.

        Tries /api/chat first (preferred), then /api/generate. Returns an
        OpenAI-like dict shape on success or None on failure.
        """
        try:
            root = base.rstrip('/')
            if root.endswith('/v1'):
                root = root[:-3]
            root = root.rstrip('/')
            headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
            # Prefer /api/chat with messages
            chat_body = {"model": model, "messages": messages, "stream": False, "options": {"temperature": temperature, "top_p": top_p}}
            r = requests.post(f"{root}/api/chat", json=chat_body, headers=headers, timeout=20)
            if 200 <= r.status_code < 300:
                jd = r.json()
                content = (
                    ((jd or {}).get("message") or {}).get("content")
                    or jd.get("response")
                    or ""
                )
                return {"choices":[{"message":{"role":"assistant","content": content}}]}
            # Fallback to /api/generate by joining messages
            try:
                prompt = "\n".join([f"{m.get('role','user')}: {m.get('content','')}" for m in messages])
            except Exception:
                prompt = "\n".join([str(m) for m in messages])
            gen_body = {"model": model, "prompt": prompt, "stream": False, "options": {"temperature": temperature, "top_p": top_p}}
            r2 = requests.post(f"{root}/api/generate", json=gen_body, headers=headers, timeout=20)
            if 200 <= r2.status_code < 300:
                jd = r2.json()
                content = jd.get("response") or ""
                return {"choices":[{"message":{"role":"assistant","content": content}}]}
        except Exception:
            return None
        return None

    try:
        data = _post_chat(base, key, payload, timeout=int(LLM_READ_TIMEOUT))
        try:
            # Peek at tentative reply length
            _tmp = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
            _log.info("LLM:primary ok chars=%d rid=%s", len(_tmp), get_request_id() or "-")
        except Exception:
            pass
    except (requests.exceptions.ConnectTimeout, requests.exceptions.ConnectionError, requests.HTTPError) as err:
        # One-shot retry on read/connect timeout during warm window if enabled
        is_timeout = isinstance(err, (requests.exceptions.ConnectTimeout)) or (
            isinstance(getattr(err, 'response', None), requests.Response) and False  # placeholder for future classification
        )
        if (
            is_timeout and LLM_INITIAL_RETRY > 0 and
            (time.time() - _PROCESS_START_TS) <= LLM_WARM_WINDOW_S
        ):
            try:
                backoff = 0.3 + random.random() * 0.4
                time.sleep(backoff)
                data = _post_chat(base, key, payload, timeout=int(LLM_READ_TIMEOUT), _attempt=1)
                err = None  # type: ignore
            except Exception as retry_err:  # pragma: no cover - defensive
                err = retry_err  # type: ignore
                _log.debug("llm.retry.failed warm_window backoff=%s err=%s", round(backoff,2), retry_err)
        
        # On 5xx/timeout/connection issues, optionally fallback to OpenAI if a key is configured.
        # Relaxed guard: presence of any OPENAI_API_KEY enables fallback attempt to api.openai.com.
        def _has_real_openai_key() -> bool:
            try:
                k = _get_effective_openai_key() or ""
                # Treat actual OpenAI-style keys (sk-*) as real; ignore placeholders like 'ollama' or empty
                return isinstance(k, str) and k.startswith("sk-")
            except Exception:
                return False
        can_fallback = _has_real_openai_key()
        native_attempted = False
        if isinstance(err, requests.HTTPError):
            code = getattr(err.response, 'status_code', 500)
            # If 404, try Ollama native endpoints first (prefer primary local inference)
            if code == 404:
                native_attempted = True
                data_native = _try_ollama_native()
                if data_native is not None:
                    data = data_native
                    # native succeeded; do not set fallback provider
                    err = None  # type: ignore
                else:
                    # native failed; treat as transient to allow OpenAI fallback
                    pass
            transient = (code == 404) or (500 <= code < 600)
        else:
            transient = True
        if 'data' in locals():
            # already produced a response via native path
            pass
        elif can_fallback and transient:
            try:
                # Use a safe OpenAI model during fallback; do not mutate original payload
                fb_model = _model_for_openai(payload.get("model") or model)
                fb_payload = dict(payload, model=fb_model)
                data = _post_chat("https://api.openai.com/v1", _get_effective_openai_key(), fb_payload, timeout=20)
                try:
                    _fallback_provider.set("openai")
                except Exception:
                    pass
                try:
                    _tmp = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
                    _log.info("LLM:fallback openai ok chars=%d rid=%s", len(_tmp), get_request_id() or "-")
                except Exception:
                    pass
            except Exception:
                # still provide a friendly message
                try:
                    _log.warning("LLM:fallback openai failed err=%s", err)
                except Exception:
                    pass
                return ("The model backend is unavailable right now. Please try again shortly.", [])
        else:
            # Friendly messages for transient errors without fallback. Distinguish warm window timeouts.
            warm_window = (time.time() - _PROCESS_START_TS) <= LLM_WARM_WINDOW_S
            if warm_window and is_timeout:
                try:
                    _log.warning("LLM:timeout warm_window returning warming message")
                except Exception:
                    pass
                return ("[model_warming] The model is still loading; please retry shortly.", [])
            try:
                _log.warning("LLM:transient failure no-fallback returning friendly stub (%s)", type(err))
            except Exception:
                pass
            return ("The language model is temporarily unavailable. Please try again shortly.", [])
    try:
        reply = data["choices"][0]["message"]["content"]
        try:
            _log.info("LLM:final reply chars=%d rid=%s", len(reply or ""), get_request_id() or "-")
        except Exception:
            pass
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


def invoke_llm_with_optional_stub(
    *,
    requested_model: str | None,
    messages: List[Dict[str, Any]],
    temperature: float,
    top_p: float,
    allow_stub: bool,
    stub_reply: str = "stub reply",
) -> Dict[str, Any]:
    """Unified entrypoint for agent paths (bypass + main) to invoke the LLM or a deterministic stub.

    Returns a dict with keys:
      reply (str) – model output or stub text
      model (str) – normalized model id
      tool_trace (list)
      fallback (str) – optional, only present if a provider fallback occurred
      stub (bool) – True when a stub path was used

    The helper:
      * Normalizes aliases using MODEL_ALIASES
      * Resets the fallback provider context var
      * Invokes underlying call_local_llm (or call_llm) unless in pure stub mode
      * Captures any fallback provider marker
    """
    # Lightweight alias handling (mirrors a subset of agent.MODEL_ALIASES to avoid import cycle)
    alias_map = {"gpt": None, "default": None, "gpt-oss-20b": "gpt-oss:20b"}
    model_norm = alias_map.get(requested_model, requested_model) if requested_model else None
    model = model_norm or settings.DEFAULT_LLM_MODEL
    # Always reset fallback marker so prior calls in same request don't leak
    try:
        _fallback_provider.set(None)
    except Exception:
        pass
    if allow_stub:
        try:
            _log.info("LLM:invoke stub path model=%s", model)
        except Exception:
            pass
        # Still exercise call path for alias side-effects (if possible) but ignore errors
        try:
            call_fn = globals().get('call_local_llm', call_llm)  # type: ignore[name-defined]
            _ = call_fn(model=model, messages=messages, temperature=temperature, top_p=top_p)
        except Exception:
            pass
        return {
            "reply": stub_reply,
            "model": model,
            "tool_trace": [],
            "stub": True,
        }
    # Real call
    call_fn = globals().get('call_local_llm', call_llm)  # type: ignore[name-defined]
    reply, tool_trace = call_fn(model=model, messages=messages, temperature=temperature, top_p=top_p)
    fb = None
    try:
        fb = get_last_fallback_provider()
    except Exception:
        fb = None
    out: Dict[str, Any] = {
        "reply": reply,
        "model": model,
        "tool_trace": tool_trace,
        "stub": False,
    }
    if fb:
        out["fallback"] = fb
    return out
