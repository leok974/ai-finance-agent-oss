from fastapi import APIRouter, Header, HTTPException, Body, Request
import os
from app.services import help_cache
from typing import Dict, Any

"""Admin endpoints.

Avoid importing the FastAPI `app` instance from `app.main` to prevent circular
import issues during application startup (observed inside the container). We
access runtime state via the per-request `Request` object instead.
"""

router = APIRouter(prefix="/admin", tags=["admin"])


def _admin_token() -> str | None:
    """Fetch ADMIN_TOKEN at request time so tests that monkeypatch the
    environment after import still enforce auth. Previous implementation
    captured the value at module import, causing authorization tests to
    observe a 200 instead of 401 when ADMIN_TOKEN was later set."""
    return os.getenv("ADMIN_TOKEN")


@router.post("/help-cache/reset", status_code=204)
def reset_help_cache(x_admin_token: str | None = Header(None)):
    """Clear the help cache and its stats.
    If ADMIN_TOKEN is set in the environment, require matching x-admin-token header.
    Returns 204 No Content on success.
    """
    token = _admin_token()
    if token and x_admin_token != token:
        raise HTTPException(status_code=401, detail="unauthorized")
    help_cache.clear()
    # reset_stats clears hit/miss/eviction counters
    help_cache.reset_stats()
    return


@router.get("/toggles", summary="List runtime feature toggles")
def list_toggles(
    request: Request, x_admin_token: str | None = Header(None)
) -> Dict[str, Any]:
    token = _admin_token()
    if token and x_admin_token != token:
        raise HTTPException(status_code=401, detail="unauthorized")
    state = request.app.state
    toggles = getattr(state, "runtime_toggles", {}).copy()
    # Always reflect current authoritative sources (e.g., help_rephrase_enabled)
    toggles["help_rephrase_enabled"] = getattr(state, "help_rephrase_enabled", False)
    return {"toggles": toggles}


@router.patch("/toggles", summary="Modify runtime feature toggles")
def update_toggles(
    request: Request,
    payload: Dict[str, Any] = Body(
        ...,
        examples=[{"help_rephrase_enabled": True}],
    ),
    x_admin_token: str | None = Header(None),
):
    token = _admin_token()
    if token and x_admin_token != token:
        raise HTTPException(status_code=401, detail="unauthorized")
    state = request.app.state
    if not hasattr(state, "runtime_toggles"):
        state.runtime_toggles = {}
    updated: Dict[str, Any] = {}
    for k, v in payload.items():
        # Only allow known boolean toggles for safety
        if k == "help_rephrase_enabled":
            bool_val = bool(v)
            state.help_rephrase_enabled = bool_val
            state.runtime_toggles[k] = bool_val
            updated[k] = bool_val
        else:
            # Silently ignore unknown keys (could also 400)
            continue
    return {"updated": updated, "toggles": state.runtime_toggles}
