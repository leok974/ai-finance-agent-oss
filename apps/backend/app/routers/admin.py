from fastapi import APIRouter, Header, HTTPException
import os
from app.services import help_cache

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
