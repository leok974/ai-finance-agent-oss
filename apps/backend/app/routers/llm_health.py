from fastapi import APIRouter
import os
import httpx
from typing import Literal, Tuple

# We already have key loading logic in config: OPENAI_API_KEY and OPENAI_API_KEY_FILE.
# Define a small helper to report presence + source without exposing the key.
def _read_openai_key_meta() -> Tuple[bool, Literal['env','file','absent']]:
    k = os.getenv("OPENAI_API_KEY")
    if k and k.strip():
        return True, 'env'
    path = os.getenv("OPENAI_API_KEY_FILE", "/run/secrets/openai_api_key")
    try:
        if path and os.path.isfile(path):
            # only check existence/readability; do not return contents
            with open(path, 'r', encoding='utf-8') as f:
                present = bool(f.read().strip())
            return (True if present else False), ('file' if present else 'absent')
    except Exception:
        pass
    return False, 'absent'

router = APIRouter(prefix="/llm", tags=["llm"])

@router.get("/health")
async def llm_health():
    status = {"ollama": "down", "openai": "not_configured"}
    present, src = _read_openai_key_meta()
    key_info = {"present": present, "source": (src if present else "absent")}
    # Ollama
    try:
        host = os.getenv("OLLAMA_HOST", "ollama")
        port = int(os.getenv("OLLAMA_PORT", "11434"))
        async with httpx.AsyncClient(timeout=3) as x:
            r = await x.get(f"http://{host}:{port}/api/version")
            status["ollama"] = "up" if r.status_code == 200 else f"err:{r.status_code}"
    except Exception:
        pass
    if present:
        status["openai"] = "configured"
    return {"ok": True, "status": status, "openai_key": key_info}
