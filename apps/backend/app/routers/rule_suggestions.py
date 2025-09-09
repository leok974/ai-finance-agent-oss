from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.db import get_db
from app.services.rule_suggestions import (
    list_suggestions,
    accept_suggestion,
    dismiss_suggestion,
)

router = APIRouter(prefix="/rules/suggestions", tags=["rules"])


@router.get("", response_model=list)
def get_suggestions(
    merchant_norm: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    return list_suggestions(
        db,
        merchant_norm=merchant_norm,
        category=category,
        limit=limit,
        offset=offset,
    )


@router.post("/{sug_id}/accept")
def accept_sug(sug_id: int, db: Session = Depends(get_db)):
    rid = accept_suggestion(db, sug_id)
    if not rid:
        raise HTTPException(status_code=404, detail="suggestion not found")
    return {"ok": True, "rule_id": rid}


@router.post("/{sug_id}/dismiss")
def dismiss_sug(sug_id: int, db: Session = Depends(get_db)):
    ok = dismiss_suggestion(db, sug_id)
    if not ok:
        raise HTTPException(status_code=404, detail="suggestion not found")
    return {"ok": True}
