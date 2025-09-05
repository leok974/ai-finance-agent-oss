import os
import httpx
from typing import List, Dict, Tuple

OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://localhost:11434/v1")
OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "ollama")

# Module-global HTTP client with sane timeouts and retries
_client = httpx.Client(
    base_url=OPENAI_BASE_URL,
    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
    timeout=httpx.Timeout(30.0, connect=5.0, read=30.0, write=30.0),
)

def call_local_llm(*, model: str, messages: List[Dict[str, str]], temperature: float=0.2, top_p: float=0.9) -> Tuple[str, list]:
    """Call local LLM with reusable HTTP client and proper error handling."""
    payload = {
        "model": model, 
        "messages": messages, 
        "temperature": temperature, 
        "top_p": top_p
    }
    
    try:
        r = _client.post("/chat/completions", json=payload)
        r.raise_for_status()
        data = r.json()
        
        # Extract reply from OpenAI-compatible response
        reply = data["choices"][0]["message"]["content"]
        tool_trace = data.get("tool_trace", [])
        
        return reply, tool_trace
        
    except httpx.TimeoutException as e:
        raise Exception(f"LLM request timeout: {e}")
    except httpx.HTTPStatusError as e:
        raise Exception(f"LLM HTTP error {e.response.status_code}: {e.response.text}")
    except (KeyError, IndexError) as e:
        raise Exception(f"Unexpected LLM response format: {e}")
    except Exception as e:
        raise Exception(f"LLM call failed: {e}")
