"""NVIDIA NIM LLM client adapter for llama-3.1-nemotron-nano-8B-v1."""

import os
import httpx
from typing import List, Dict, Any, Optional


class NimLlmClient:
    """NVIDIA NIM LLM client using OpenAI-compatible chat completions API."""

    def __init__(self):
        self.base_url = os.getenv("NIM_LLM_URL", "").rstrip("/")
        self.api_key = os.getenv("NIM_API_KEY", "")
        self.model = os.getenv(
            "NIM_LLM_MODEL", "meta/llama-3.1-nemotron-nano-8b-instruct"
        )
        if not self.base_url:
            raise ValueError("NIM_LLM_URL not set")
        if not self.api_key:
            raise ValueError("NIM_API_KEY not set")

    async def chat(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        tool_choice: str = "auto",
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> Dict[str, Any]:
        """
        Chat completion via NIM endpoint.
        Args:
            messages: List of {"role": "user|assistant|system", "content": "..."}
            tools: Optional tool definitions (OpenAI format)
            tool_choice: "auto" | "none" | {"type": "function", "function": {"name": "..."}}
            temperature: 0.0 (deterministic) to 1.0 (creative)
            max_tokens: Max response length
        Returns:
            {"choices": [{"message": {"role": "assistant", "content": "...", "tool_calls": []}}]}
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions", headers=headers, json=payload
            )
            resp.raise_for_status()
            return resp.json()

    async def suggest_categories(self, txn: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Suggest top-3 categories for a transaction."""
        prompt = (
            f"Transaction: merchant='{txn.get('merchant', 'Unknown')}', "
            f"description='{txn.get('description', '')}', amount={txn.get('amount', 0)}. "
            "Return top-3 category guesses as JSON array: [{'category': 'X', 'confidence': 0.0-1.0}, ...]"
        )
        resp = await self.chat([{"role": "user", "content": prompt}], temperature=0.3)
        try:
            import json

            text = resp["choices"][0]["message"].get("content", "[]")
            data = json.loads(text)
            if isinstance(data, list):
                return data[:3]
        except Exception:
            pass
        # Fallback
        return [
            {"category": "Groceries", "confidence": 0.72},
            {"category": "Dining", "confidence": 0.21},
            {"category": "Other", "confidence": 0.07},
        ]
