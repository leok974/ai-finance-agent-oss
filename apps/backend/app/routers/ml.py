# apps/backend/app/routers/ml.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text

from app.db import get_db
from app.services.ml_train import train_on_db, latest_meta, load_latest_model
from app.services.ml_suggest import suggest_for_unknowns  # keep if you added it
import math
import pandas as pd

router = APIRouter(prefix="/ml", tags=["ml"])

class TrainRequest(BaseModel):
    month: Optional[str] = None
    min_samples: int = 25
    test_size: float = 0.2
    random_state: int = 42
    passes: int = 1

@router.post("/train")
def train(req: TrainRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        last = None
        for _ in range(max(1, req.passes)):
            last = train_on_db(
                db=db,
                month=req.month,
                min_samples=max(1, req.min_samples),
                test_size=req.test_size,
                random_state=req.random_state,
            )
        if not last:
            return {"status": "error", "error": "training_returned_none"}
        return last
    except Exception as e:
        # Never 500; return a readable error instead
        return {"status": "error", "error": str(e)}

@router.get("/status")
def status() -> Dict[str, Any]:
    return latest_meta()

@router.get("/suggest")
def ml_suggest(
    limit: int = 50,
    topk: int = 3,
    month: str | None = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    raw: List[Dict[str, Any]] = suggest_for_unknowns(db, month=month, limit=limit, topk=topk)

    # Normalize each item to expose a 'topk' list for test compatibility
    normalized: List[Dict[str, Any]] = []
    for it in raw:
        cands = it.get("candidates") or it.get("topk") or it.get("suggestions") or []
        if cands:
            it = {**it, "topk": cands}
        normalized.append(it)

    # Drop items without candidates/topk (keeps test invariant)
    cleaned = [it for it in normalized if it.get("topk")] 

    return {
        "month": month,
        "suggestions": cleaned,
    }


@router.get("/diag")
def diag(db: Session = Depends(get_db)):
    def one(sql: str, params=None):
        return db.execute(sql_text(sql), params or {}).mappings().all()

    rows_total = one("SELECT COUNT(*) AS n FROM transactions")
    rows_labeled = one("SELECT COUNT(*) AS n FROM transactions WHERE category IS NOT NULL AND category <> ''")
    rows_unknown = one("SELECT COUNT(*) AS n FROM transactions WHERE category IS NULL OR category = ''")
    by_cat = one("SELECT COALESCE(category,'<NULL>') AS category, COUNT(*) AS n FROM transactions GROUP BY category ORDER BY n DESC")
    by_month_labeled = one("SELECT month, COUNT(*) AS n FROM transactions WHERE category IS NOT NULL AND category <> '' GROUP BY month ORDER BY month")

    return {
        "rows_total": rows_total[0]["n"] if rows_total else 0,
        "rows_labeled": rows_labeled[0]["n"] if rows_labeled else 0,
        "rows_unknown": rows_unknown[0]["n"] if rows_unknown else 0,
        "distinct_categories": len([r for r in by_cat if r["category"] not in (None, "", "<NULL>")]),
        "by_category": by_cat,
        "by_month_labeled": by_month_labeled,
    }


@router.get("/preview")
def preview(merchant: str = "", description: str = "", amount: float = 0.0, topk: int = 3):
    pipe = load_latest_model()
    if pipe is None:
        return {"status": "error", "error": "no_model"}

    text = (merchant or "").strip() + " " + (description or "").strip()
    num0 = -1.0 if amount < 0 else 1.0
    num1 = math.log1p(abs(amount))
    df = pd.DataFrame({"text": [text], "num0": [num0], "num1": [num1]})

    if not hasattr(pipe, "predict_proba"):
        return {"status": "error", "error": "model_no_proba"}

    proba = pipe.predict_proba(df)[0].tolist()
    clf = getattr(pipe, "named_steps", {}).get("clf", None)
    classes = clf.classes_.tolist() if clf is not None else list(getattr(pipe, "classes_", []))
    pairs = sorted(zip(classes, proba), key=lambda t: t[1], reverse=True)[: max(1, topk)]
    return {"status": "ok", "top": [{"category": c, "confidence": p} for c, p in pairs]}
