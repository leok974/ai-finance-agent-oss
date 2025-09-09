from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import Any, Dict, List, Optional, Literal
from app.db import get_db
from app.transactions import Transaction
from app.models import Feedback
from app.services.ml_suggest import suggest_for_unknowns
from app.services import rule_suggestions
from app.services.ml_train import incremental_update, train_on_db
from app.services.ml_train_service import incremental_update_rows, latest_model_path

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


# Typed feedback for suggestion acceptance/rejection
class FeedbackInSuggest(BaseModel):
    txn_id: int = Field(..., description="Transaction id to which feedback applies")
    merchant: Optional[str] = Field(None, description="Merchant name override (defaults to txn.merchant)")
    category: str = Field(..., min_length=1)
    action: Literal["accept", "reject"]

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

@router.post("/ml/selftest")
def ml_selftest(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    E2E smoke test for incremental learning:
      - Ensure model has 'Coffee' class (train if missing)
      - Pick a real txn (prefer coffee-like)
      - Build feature dict {text,num0,num1}
      - Incrementally update to label 'Coffee'
      - Verify model mtime bumped and status sane
    """
    import os, time
    # 0) Read current status (classes + feedback_count)
    before = ml_status(db)
    classes = before.get("classes") or []

    # 1) Ensure model is trained and includes 'Coffee'
    if not classes or "Coffee" not in classes:
        try:
            # attempt a quick train pass
            train_on_db(db=db, month=None, min_samples=6, test_size=0.2)
            time.sleep(0.1)
        except Exception:
            # best-effort; we'll validate below
            pass
        before = ml_status(db)
        classes = before.get("classes") or []
        if "Coffee" not in classes:
            return {
                "ok": False,
                "updated": False,
                "reason": "coffee_missing_after_train",
                "classes_after_train": classes,
            }

    model_path = latest_model_path()
    mtime_before = os.path.getmtime(model_path) if os.path.exists(model_path) else None

    # 2) Pick a transaction (prefer something coffee-like)
    txn = (
        db.query(Transaction)
        .filter(
            (Transaction.merchant.ilike("%starbucks%")) | (Transaction.description.ilike("%coffee%"))
        )
        .order_by(Transaction.id.desc())
        .first()
    ) or db.query(Transaction).order_by(Transaction.id.desc()).first()
    if not txn:
        return {"ok": False, "updated": False, "reason": "no_transactions"}

    # 3) Build features aligned to preprocessor
    amt = float(getattr(txn, "amount", 0.0) or 0.0)
    text = f"{txn.merchant or ''} {txn.description or ''}".strip()
    row = {"text": text, "num0": amt, "num1": abs(amt)}

    # 4) Incremental update toward 'Coffee'
    upd = incremental_update_rows([row], ["Coffee"]) or {}
    updated_classes = upd.get("classes") or []

    # 5) Re-check status and model timestamp
    time.sleep(0.15)
    after = ml_status(db)
    mtime_after = os.path.getmtime(model_path) if os.path.exists(model_path) else None

    mtime_bumped = (
        (mtime_before is None and mtime_after is not None)
        or (
            isinstance(mtime_before, float)
            and isinstance(mtime_after, float)
            and mtime_after > mtime_before
        )
    )

    return {
        "ok": bool(mtime_bumped and ("Coffee" in ((after.get("classes") or updated_classes or [])))) ,
        "updated": mtime_bumped,
        "reason": None if mtime_bumped else "mtime_not_changed",
        "used_txn_id": txn.id,
        "label_used": "Coffee",
        "mtime_before": mtime_before,
        "mtime_after": mtime_after,
        "mtime_bumped": mtime_bumped,
        "classes_before": classes,
        "classes_after": after.get("classes") or updated_classes,
        "feedback_count_before": before.get("feedback_count"),
        "feedback_count_after": after.get("feedback_count"),
        "model_path": model_path,
    }

@router.get("/ml/suggest")
def ml_suggest(
    limit: int = 50,
    topk: int = 3,
    month: str | None = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
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
    # Note: keep output quiet in production/tests

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
    txn_id: int = Field(..., description="Transaction id to which feedback applies")
    merchant: Optional[str] = Field(None, description="Merchant name override (defaults to txn.merchant)")
    category: str = Field(..., min_length=1)
    action: Literal["accept", "reject"]

class FeedbackByIdIn(BaseModel):
    id: int  # DB primary key
    label: str
    source: str = "user_change"
    notes: str | None = None


@router.post("/ml/feedback")
def record_feedback(fb: FeedbackIn, db: Session = Depends(get_db)):
    # Fetch ORM transaction by DB id
    txn = db.query(Transaction).filter(Transaction.id == fb.txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    row = Feedback(
        txn_id=txn.id,
    label=fb.category,
    source=fb.action,  # store exact action for DB-agnostic metrics
        notes=None,
    )
    db.add(row)
    db.flush()
    try:
        db.refresh(row)  # populate server defaults like created_at
    except Exception:
        pass

    # If this was an accept, evaluate for rule suggestion
    if fb.action == "accept":
        try:
            # Prefer the canonicalized merchant from the actual transaction for stable matching
            mnorm = rule_suggestions.canonicalize_merchant(txn.merchant or fb.merchant)
            sugg = rule_suggestions.evaluate_candidate(db, mnorm, fb.category)
            if sugg:
                db.commit()
                return {"ok": True, "id": row.id, "suggestion_id": sugg.id}
        except Exception as e:
            # non-fatal
            print(f"[feedback] evaluate_candidate failed: {e}")

    db.commit()
    return {"ok": True, "id": row.id}

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
