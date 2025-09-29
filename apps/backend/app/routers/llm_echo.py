import os
from fastapi import APIRouter
from app.utils.llm import call_llm

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/echo")
def echo():  # pragma: no cover - trivial health helper
    """Perform a tiny completion to verify model path.

    Returns JSON with: ok, len, sample.
    """
    model = os.getenv("LLM_MODEL", "gpt-oss:20b")
    base = os.getenv("OPENAI_BASE_URL", "http://ollama:11434/v1")
    # Use a minimal one-token style prompt; keep deterministic-ish
    try:
        reply, _ = call_llm(model=model, messages=[{"role": "user", "content": "ping"}], temperature=0.0, top_p=0.9)
    except Exception as e:  # degrade gracefully
        return {"ok": False, "error": str(e)}
    return {"ok": bool(reply), "len": len(reply or ""), "sample": (reply or "")[:80]}
