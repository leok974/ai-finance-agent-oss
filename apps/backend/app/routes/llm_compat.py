"""Legacy compatibility endpoints for older web UI expecting /llm/models.

Historically this module imported a sibling ``agent`` module inside the same
``app.routes`` package. The real agent implementation now lives in
``app.routers.agent`` (note the *routers* directory) and provides a synchronous
``list_models()`` FastAPI endpoint function. The previous relative import
``from .agent import models`` caused a runtime ``ModuleNotFoundError`` because
``app.routes.agent`` no longer exists, preventing the backend from starting.

We adapt by importing ``app.routers.agent`` and calling ``list_models()``.
The original shim expected an awaitable ``agent_models(refresh=...)`` returning
an object with provider/default/models plus optional primary/fallback status.
Current ``list_models()`` returns just provider/default/models. We enhance the
shape here with conservative defaults and add a ``models_ok`` boolean so the
UI can retain its simple health heuristic without depending on internal
fallback metadata.

# NOTE: This router is temporary.
# /llm/models is deprecated; see docs/LLM_SETUP.md for migration plan.
# Remove after deprecation window ends (CHANGELOG + README updated).
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from typing import Any, Dict

try:  # Import the canonical agent router module
    from app.routers import agent as agent_router  # type: ignore
except Exception as e:  # pragma: no cover - extremely defensive
    agent_router = None  # type: ignore
    _import_error = e  # capture for later surface
else:
    _import_error = None  # type: ignore

router = APIRouter()


def _safe_list_models(
    refresh: bool = False,
) -> Dict[str, Any]:  # refresh retained for signature compat
    if agent_router is None:
        return {
            "provider": "unknown",
            "default": None,
            "models": [],
            "error": f"agent_router import failed: {_import_error}",
        }
    try:
        data = agent_router.list_models()  # underlying function is sync
        if not isinstance(data, dict):  # normalize
            data = {"provider": "unknown", "default": None, "models": []}
        return data
    except Exception as e:  # pragma: no cover - defensive
        return {"provider": "unknown", "default": None, "models": [], "error": str(e)}


@router.get("/llm/models")
async def llm_models(refresh: bool = False) -> JSONResponse:
    data: Dict[str, Any] = _safe_list_models(refresh=refresh)
    # Derive a simple OK heuristic: at least one model plus a default id
    models_list = data.get("models") or []
    models_ok = bool(models_list and data.get("default"))
    # Provide a synthetic path key (used by some legacy UI layers)
    if "path" not in data:
        data["path"] = "primary" if models_ok else None
    data["models_ok"] = models_ok
    return JSONResponse(data)
