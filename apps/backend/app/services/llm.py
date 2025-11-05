import json
import asyncio
import random
import time
import email.utils as eut
import os
import httpx
from ..config import OPENAI_BASE_URL, OPENAI_API_KEY, MODEL, DEV_ALLOW_NO_LLM
from app.utils.request_ctx import get_request_id


def _parse_retry_after(v: str | None) -> float | None:
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


def get_llm_client():
    """Factory to return appropriate LLM client based on provider."""
    from app.config import settings

    provider = os.getenv(
        "DEFAULT_LLM_PROVIDER", getattr(settings, "DEFAULT_LLM_PROVIDER", "ollama")
    )
    if provider == "nim":
        from app.providers.nim_llm import NimLlmClient

        return NimLlmClient()
    else:
        # Existing LLMClient (OpenAI-compatible)
        return LLMClient()


class LLMClient:
    def __init__(self):
        self.base = OPENAI_BASE_URL.rstrip("/")
        # Prefer env-provided key (dev) else secret file (prod)
        key = os.getenv("OPENAI_API_KEY") or OPENAI_API_KEY
        self.key = key.strip() if isinstance(key, str) else key
        self.model = MODEL

    async def chat(self, messages, tools=None, tool_choice="auto"):
        if DEV_ALLOW_NO_LLM:
            # Deterministic stub for dev
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "(stub)",
                            "tool_calls": [],
                        }
                    }
                ]
            }

        headers = {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        payload = {"model": self.model, "messages": messages}
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
        delays = [1.5, 3.0, 6.0, 0.0]
        async with httpx.AsyncClient(timeout=60) as client:
            attempt = 0
            total_wait = 0.0
            max_attempts = 4
            rid = get_request_id()
            while True:
                r = await client.post(
                    f"{self.base}/chat/completions", headers=headers, json=payload
                )
                if r.status_code == 429:
                    # Respect Retry-After when available
                    ra = _parse_retry_after(r.headers.get("Retry-After"))
                    base = delays[attempt] if attempt < len(delays) else delays[-1]
                    wait = ra if (ra is not None and ra > 0) else base
                    # full jitter up to 40%
                    wait = min(8.0, wait + random.uniform(0, max(0.0, wait * 0.4)))
                    # cap total budget ~15s
                    if attempt >= (max_attempts - 1) or (total_wait + wait > 15.0):
                        return {
                            "choices": [
                                {
                                    "message": {
                                        "role": "assistant",
                                        "content": "I'm temporarily over capacity. Please retry in a moment.",
                                        "tool_calls": [],
                                    }
                                }
                            ]
                        }
                    # minimal structured log
                    try:
                        print(
                            {
                                "evt": "llm.retry",
                                "rid": rid,
                                "attempt": attempt + 1,
                                "status": 429,
                                "retry_after": ra,
                                "wait": round(wait, 2),
                            }
                        )
                    except Exception:
                        pass
                    await asyncio.sleep(wait)
                    total_wait += wait
                    attempt += 1
                    continue

                r.raise_for_status()
                return r.json()

    async def suggest_categories(self, txn):
        # Ask the model for top-3 categories with confidences. Keep it short.
        prompt = f"Transaction: merchant='{txn['merchant']}', description='{txn.get('description','')}', amount={txn['amount']}. Return top-3 category guesses as JSON array of objects with 'category' and 'confidence' in [0,1]."
        resp = await self.chat([{"role": "user", "content": prompt}])
        # Parse best-effort
        try:
            text = resp["choices"][0]["message"].get("content", "[]")
            data = json.loads(text)
            if isinstance(data, list):
                return data
        except Exception:
            pass
        # Fallback stub
        base = [
            {"category": "Groceries", "confidence": 0.72},
            {"category": "Dining", "confidence": 0.21},
            {"category": "Transport", "confidence": 0.07},
        ]
        return base
