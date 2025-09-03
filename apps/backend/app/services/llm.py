import json
import httpx
from ..config import OPENAI_BASE_URL, OPENAI_API_KEY, MODEL, DEV_ALLOW_NO_LLM

class LLMClient:
    def __init__(self):
        self.base = OPENAI_BASE_URL.rstrip("/")
        self.key = OPENAI_API_KEY
        self.model = MODEL

    async def chat(self, messages, tools=None, tool_choice="auto"):
        if DEV_ALLOW_NO_LLM:
            # Deterministic stub for dev
            return {"choices":[{"message":{"role":"assistant","content":"(stub)","tool_calls":[]}}]}

        headers = {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        payload = {"model": self.model, "messages": messages}
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(f"{self.base}/chat/completions", headers=headers, json=payload)
            r.raise_for_status()
            return r.json()

    async def suggest_categories(self, txn):
        # Ask the model for top-3 categories with confidences. Keep it short.
        prompt = f"Transaction: merchant='{txn['merchant']}', description='{txn.get('description','')}', amount={txn['amount']}. Return top-3 category guesses as JSON array of objects with 'category' and 'confidence' in [0,1]."
        resp = await self.chat([{"role":"user","content":prompt}])
        # Parse best-effort
        try:
            text = resp["choices"][0]["message"].get("content","[]")
            data = json.loads(text)
            if isinstance(data, list):
                return data
        except Exception:
            pass
        # Fallback stub
        base = [{"category":"Groceries","confidence":0.72},{"category":"Dining","confidence":0.21},{"category":"Transport","confidence":0.07}]
        return base
