"""Operations diagnostic router for DevDiag integration.

Admin-only endpoint for triggering diagnostic checks against target URLs.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from app.utils.authz import require_admin
from app.orm_models import User

# Import DevDiag client
import sys
import os

# Add backend root to path for diag module import
backend_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from diag.devdiag_client import quickcheck


router = APIRouter(prefix="/ops", tags=["ops"])


@router.post("/diag")
async def diag_now(
    target_url: str = Query(..., description="Absolute URL to probe"),
    preset: str = Query("full", pattern="^(app|embed|chat|full)$"),
    _user: User = Depends(require_admin),
):
    """Run DevDiag quickcheck against a target URL.

    **Admin only.** Triggers diagnostic scan using mcp-devdiag service.

    Args:
        target_url: Absolute URL to probe (e.g., "https://app.ledger-mind.org")
        preset: Diagnostic preset - one of: app, embed, chat, full

    Returns:
        DevDiag diagnostic results including:
        - CSP violations
        - Portal root checks
        - Console errors
        - React #185 detection
        - Embed compatibility

    Raises:
        HTTPException: 403 if user is not admin
        HTTPException: 502 if DevDiag service is unavailable
    """
    try:
        result = await quickcheck(target_url, preset=preset)
        return {"ok": True, "devdiag": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"DevDiag service error: {str(e)}")
