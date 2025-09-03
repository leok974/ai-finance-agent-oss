from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal, Dict
import json, urllib.request
from ..services.llm import LLMClient
from ..services.agent_tools import tool_specs, call_tool

router = APIRouter()  # <-- no prefix here (main.py supplies /agent)

# Optional compatibility models: accept either a simple prompt or messages[]
class Msg(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class ChatReq(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[Msg]] = None
    context: Optional[Dict] = None

@router.get("/status")
def agent_status(model: str = "gpt-oss:20b"):
    """Ping Ollama with a tiny prompt to verify agent connectivity."""
    try:
        body = json.dumps({"model": model, "prompt": "pong!", "stream": False})
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            # Include broader compatibility flags
            return {"ok": True, "status": "ok", "pong": True, "reply": data.get("response", "")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

SYSTEM = "You are a helpful finance agent. Prefer using tools to act. Be concise."

@router.post("/chat")
async def chat(req: ChatReq):
    # Normalize to messages[]
    if not (req.messages or req.prompt):
        raise HTTPException(status_code=422, detail="Provide 'messages' or 'prompt'")
    base_msgs: List[dict]
    if req.messages:
        base_msgs = [m.model_dump() for m in req.messages]
    else:
        base_msgs = [{"role": "user", "content": req.prompt or ""}]
    messages = [{"role": "system", "content": SYSTEM}] + base_msgs
    # Auto-context enrichment
    ctx = req.context or {}
    if "month" not in ctx:
        # naive default to latest month seen
        from ..main import app
        months = sorted({t["date"][:7] for t in app.state.txns if t.get("date")})
        if months:
            ctx["month"] = months[-1]
    messages.append({"role":"system","content": f"Context: {ctx}"})
    llm = LLMClient()
    tools = tool_specs()
    resp = await llm.chat(messages, tools=tools, tool_choice="auto")
    msg = resp["choices"][0]["message"]
    tool_calls = msg.get("tool_calls") or []
    tool_results = []
    for call in tool_calls:
        fn = call.get("function",{}).get("name")
        args = call.get("function",{}).get("arguments","{}")
        try:
            parsed = json.loads(args)
        except Exception:
            parsed = {}
        result = call_tool(fn, parsed)
        tool_results.append({"name": fn, "args": parsed, "result": result})
    return {"message": msg.get("content",""), "tool_results": tool_results}
