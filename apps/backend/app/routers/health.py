# apps/backend/app/routers/health.py
from fastapi import APIRouter
import json, urllib.request

router = APIRouter()

def _ollama_tags():
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=1.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            models = []
            if isinstance(data, dict) and isinstance(data.get("models"), list):
                for m in data["models"]:
                    name = (m or {}).get("name")
                    if name:
                        models.append(name)
            return True, {"models": models}
    except Exception as e:
        return False, {"error": str(e)}

def _ollama_generate_ping(model="gpt-oss:20b"):
    try:
        body = json.dumps({"model": model, "prompt": "ping"})
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            return True, {"reply": data.get("response", "")}
    except Exception as e:
        return False, {"error": str(e)}

@router.get("/full")
def full_health():
    api_ok = True  # if we're here, the API handled the request
    ml_ok, ml_info = _ollama_tags()
    agent_ok, agent_info = _ollama_generate_ping()

    return {
        "ok": api_ok and ml_ok and agent_ok,
        "api": {"ok": api_ok},
        "ml": {"ok": ml_ok, **ml_info},
        "agent": {"ok": agent_ok, **agent_info},
    }
