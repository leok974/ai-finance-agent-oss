from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
import os
from app.db import get_db
from app.services.explain_service import build_explain_response
from app.services.llm_flags import llm_allowed

router = APIRouter()


@router.get("/{txn_id}/explain")
def explain(txn_id: int, use_llm: bool = Query(False, description="Optional: rephrase rationale with LLM"), db: Session = Depends(get_db)):
    """
    Explain a transaction deterministically with DB-backed evidence.
    Optional LLM polish can be enabled via ?use_llm=1.
    """
    try:
        # Hard short-circuit: environment-level disable wins unless FORCE_LLM_TESTS=1
        if os.getenv("DEV_ALLOW_NO_LLM", "0") == "1" and os.getenv("FORCE_LLM_TESTS", "0") != "1":
            effective_llm = False
        else:
            effective_llm = bool(use_llm) and llm_allowed(force=bool(use_llm))
        resp = build_explain_response(db, txn_id, allow_llm=effective_llm)
        # Safeguard: if disabled flag set, coerce response to deterministic
        if os.getenv("DEV_ALLOW_NO_LLM", "0") == "1" and os.getenv("FORCE_LLM_TESTS", "0") != "1":
            if isinstance(resp, dict):
                resp["llm_rationale"] = None
                resp["mode"] = "deterministic"
        return resp
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        # Hide internal errors behind generic 500 to avoid leaking details
        raise HTTPException(status_code=500, detail="Failed to build explanation")
