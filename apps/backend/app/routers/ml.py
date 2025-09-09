from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import Any, Dict, List, Optional
from app.db import get_db
from app.orm_models import Transaction, Feedback
from app.services.ml_suggest import suggest_for_unknowns
from app.services.ml_train import incremental_update, train_on_db

router = APIRouter()

def _fetch_txn_row(db: Session, any_id: int):
    """Fetch a transaction row by DB id (raw SQL)."""
    # 1) DB primary key
    row = db.execute(
        text("select id, merchant, description, amount from transactions where id=:id"),
        {"id": any_id},
    ).mappings().first()
    if row:
        return row
    # 2) fallback to external txn_id only if present; comment out by default
    # row = db.execute(
    #     text("select id, merchant, description, amount from transactions where txn_id=:tid"),
    #     {"tid": any_id},
    # ).mappings().first()
    # if row:
    #     return row
    return None

class TrainParams(BaseModel):
    min_samples: int | None = 6
    test_size: float | None = 0.2
    month: str | None = None

@router.post("/ml/train")
def train_model(params: TrainParams, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        result = train_on_db(
            db=db,
            month=params.month,
            min_samples=params.min_samples if params.min_samples is not None else 6,
            test_size=params.test_size if params.test_size is not None else 0.2,
        )
        # ok = True for successful training or informative skips
        ok = bool(result.get("status") in {"ok", "skipped"})
        return {"ok": ok, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ml/status")
def ml_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    info: Dict[str, Any] = {"ok": True}
    # Add lightweight metrics; keep resilient
    try:
        info["feedback_count"] = int(db.query(Feedback).count())
    except Exception:
        info["feedback_count"] = None
    # Also surface model classes for UI visibility
    try:
        import os
        import joblib
        model_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "models", "latest.joblib"))
        if os.path.exists(model_path):
            pipe = joblib.load(model_path)
            steps = getattr(pipe, "named_steps", {}) or {}
            clf = steps.get("clf")
            info["classes"] = sorted(list(getattr(clf, "classes_", []))) if clf is not None else []
        else:
            info["classes"] = []
    except Exception:
        info["classes"] = []
    return info

@router.get("/ml/suggest")
def ml_suggest(
    limit: int = 50,
    topk: int = 3,
    month: str | None = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    # debug prints removed
    # Define "unlabeled": None, empty string, or literal "Unknown" (case-insensitive)
    unlabeled_cond = (
        (Transaction.category.is_(None)) |
        (func.trim(Transaction.category) == "") |
        (func.lower(Transaction.category) == "unknown")
    )

    # Build base query and (optionally) month filter
    base_q = db.query(Transaction.id).filter(unlabeled_cond)
    if month:
        base_q = base_q.filter(Transaction.month == month)

    # Compute the authoritative set of unlabeled txn IDs for this month
    unlabeled_ids = {row[0] for row in base_q.all()}
    # Optional debug: show the set of unlabeled txn IDs
    # debug prints removed

    # If none, return empty immediately (this is what the test expects)
    if not unlabeled_ids:
        return {"month": month, "suggestions": []}

    # Ask the service for suggestions (could be noisy; we’ll filter strictly)
    raw: List[Dict[str, Any]] = suggest_for_unknowns(db, month=month, limit=limit, topk=topk)

    # Keep only items that:
    #  1) refer to a txn_id that is in our unlabeled set, and
    #  2) actually have candidates/topk to show
    def has_candidates(item: Dict[str, Any]) -> bool:
        cands = item.get("candidates") or item.get("topk") or []
        return bool(cands)

    cleaned = [
        it for it in raw
        if it.get("txn_id") in unlabeled_ids and has_candidates(it)
    ]

    return {"month": month, "suggestions": cleaned}


# ---------- Feedback + Incremental Update ----------
class FeedbackIn(BaseModel):
    txn_id: int
    label: str
    source: str = "user_change"
    notes: str | None = None

class FeedbackByIdIn(BaseModel):
    id: int  # DB primary key
    label: str
    source: str = "user_change"
    notes: str | None = None


@router.post("/ml/feedback")
def record_feedback(payload: FeedbackIn, db: Session = Depends(get_db)):
    # 1) fetch transaction by DB id or external txn_id (raw SQL)
    row = _fetch_txn_row(db, payload.txn_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Build the columns expected by the preprocessor (ColumnTransformer):
    # text: concatenated textual fields; num0/num1: numeric features
    amt = float(row.get("amount") or 0.0)
    sample = {
        "text": " ".join([
            (row.get("merchant") or ""),
            (row.get("description") or ""),
            f"{amt:.2f}",
        ]).strip(),
        "num0": amt,
        "num1": abs(amt),
    }

    # 2) store feedback row (use DB primary key id)
    db.execute(
        text("insert into feedback (txn_id, label, source, notes) values (:tid, :label, :source, :notes)"),
        {"tid": row["id"], "label": payload.label, "source": payload.source, "notes": payload.notes or ""},
    )
    db.commit()

    # 3) best-effort incremental update
    try:
        from app.services.ml_train_service import incremental_update_rows
        upd = incremental_update_rows([sample], [payload.label])
    except Exception as e:
        upd = {"updated": False, "error": str(e)}

    # If the label isn't in the model yet, return a friendly action hint
    if upd.get("reason") == "label_not_in_model":
        return {
            "ok": True,
            "updated": False,
            "detail": upd,
            "action": {
                "type": "retrain_needed",
                "message": f"Label '{payload.label}' is not in the model yet. Categorize at least one txn as '{payload.label}' then run /ml/train once.",
                "train_example": {"min_samples": 1, "test_size": 0.0},
            },
        }

    return {"ok": True, "updated": bool(upd.get("updated")), "detail": upd}

@router.post("/ml/feedback/by_id")
def record_feedback_by_id(payload: FeedbackByIdIn, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter(Transaction.id == payload.id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found (by DB id)")

    # Build minimal text features (merchant, description, amount)
    text_parts = [txn.merchant or "", txn.description or ""]
    try:
        text_parts.append(f"{float(getattr(txn, 'amount', 0.0) or 0.0):.2f}")
    except Exception:
        pass
    text = " ".join([p for p in text_parts if p]).strip()

    fb = Feedback(
        txn_id=txn.id,
        label=payload.label,
        source=payload.source,
        notes=payload.notes,
    )
    db.add(fb)
    db.commit()

    try:
        upd = incremental_update([text], [payload.label])
    except Exception as e:
        upd = {"updated": False, "error": str(e)}

    return {"ok": True, "updated": bool(upd.get("updated")), "detail": upd}
