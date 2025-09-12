from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.services.explain_service import build_explain_response

router = APIRouter()


@router.get("/{txn_id}/explain")
def explain(txn_id: int, use_llm: bool = Query(False, description="Optional: rephrase rationale with LLM"), db: Session = Depends(get_db)):
    """
    Explain a transaction deterministically with DB-backed evidence.
    Optional LLM polish can be enabled via ?use_llm=1.
    """
    try:
        resp = build_explain_response(db, txn_id, use_llm=bool(use_llm))
        return resp
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        # Hide internal errors behind generic 500 to avoid leaking details
        raise HTTPException(status_code=500, detail="Failed to build explanation")
