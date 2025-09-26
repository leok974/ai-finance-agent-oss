from fastapi import APIRouter, Header, HTTPException, Body
import os
from app.services import help_cache
from typing import Dict, Any
from app.main import app  # circular import safe for runtime state access

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")  # optional

@router.post("/help-cache/reset", status_code=204)
def reset_help_cache(x_admin_token: str | None = Header(None)):
    """Clear the help cache and its stats.
    If ADMIN_TOKEN is set in the environment, require matching x-admin-token header.
    Returns 204 No Content on success.
    """
    if ADMIN_TOKEN and x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")
    help_cache.clear()
    # reset_stats clears hit/miss/eviction counters
    help_cache.reset_stats()
    return


@router.get("/toggles", summary="List runtime feature toggles")
def list_toggles(x_admin_token: str | None = Header(None)) -> Dict[str, Any]:
    if ADMIN_TOKEN and x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")
    toggles = getattr(app.state, "runtime_toggles", {})
    # Always reflect current authoritative sources (e.g., help_rephrase_enabled)
    toggles["help_rephrase_enabled"] = getattr(app.state, "help_rephrase_enabled", False)
    return {"toggles": toggles}


@router.patch("/toggles", summary="Modify runtime feature toggles")
def update_toggles(
    payload: Dict[str, Any] = Body(..., example={"help_rephrase_enabled": True}),
    x_admin_token: str | None = Header(None),
):
    if ADMIN_TOKEN and x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")
    if not hasattr(app.state, "runtime_toggles"):
        app.state.runtime_toggles = {}
    updated: Dict[str, Any] = {}
    for k, v in payload.items():
        # Only allow known boolean toggles for safety
        if k == "help_rephrase_enabled":
            bool_val = bool(v)
            app.state.help_rephrase_enabled = bool_val
            app.state.runtime_toggles[k] = bool_val
            updated[k] = bool_val
        else:
            # Silently ignore unknown keys (could also 400)
            continue
    return {"updated": updated, "toggles": app.state.runtime_toggles}
