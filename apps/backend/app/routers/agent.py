from fastapi import APIRouter
import json, urllib.request
from ..models import ChatRequest
from ..services.llm import LLMClient
from ..services.agent_tools import tool_specs, call_tool

router = APIRouter()  # <-- no prefix here (main.py supplies /agent)

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
            return {"ok": True, "reply": data.get("response", "")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

SYSTEM = "You are a helpful finance agent. Prefer using tools to act. Be concise."

@router.post("/chat")
async def chat(req: ChatRequest):
    messages = [{"role":"system","content": SYSTEM}] + [m.model_dump() for m in req.messages]
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
