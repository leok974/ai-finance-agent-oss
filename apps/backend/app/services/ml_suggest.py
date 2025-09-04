# apps/backend/app/services/ml_suggest.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import math
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from app.services.ml_train import load_latest_model
import pandas as pd

HEURISTIC_MAP: List[Tuple[str, str]] = [
    ("STARBUCKS", "Dining out"), ("DUNKIN", "Dining out"), ("MCDONALD", "Dining out"), ("UBER EATS", "Dining out"),
    ("UBER", "Transport"), ("LYFT", "Transport"), ("SHELL", "Transport"), ("EXXON", "Transport"),
    ("AMAZON", "Shopping"), ("TARGET", "Shopping"),
    ("WALMART", "Groceries"), ("KROGER", "Groceries"), ("SAFEWAY", "Groceries"), ("COSTCO", "Groceries"),
    ("NETFLIX", "Subscriptions"), ("SPOTIFY", "Subscriptions"), ("HULU", "Subscriptions"),
    ("APPLE.COM/BILL", "Subscriptions"), ("GOOGLE*", "Subscriptions"),
]

def _fetch_unknowns(db: Session, month: Optional[str], limit: int) -> List[Dict[str, Any]]:
    where = "WHERE category IS NULL"
    params: Dict[str, Any] = {}
    if month:
        where += " AND month = :m"
        params["m"] = month
    sql = f"""
    SELECT id, merchant, description, amount, month
    FROM transactions
    {where}
    ORDER BY id DESC
    LIMIT :lim
    """
    params["lim"] = int(limit)
    rows = db.execute(sql_text(sql), params).mappings().all()
    return [dict(r) for r in rows]

def _build_features(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    texts: List[str] = []
    nums: List[List[float]] = []
    for r in rows:
        merchant = (r.get("merchant") or "").strip()
        desc = (r.get("description") or "").strip()
        texts.append((merchant + " " + desc).strip())
        amt = float(r.get("amount") or 0.0)
        sign = -1.0 if amt < 0 else 1.0
        mag = math.log1p(abs(amt))
        nums.append([sign, mag])
    return {"text": texts, "num": nums}

def _heuristic_guess(merchant: str, description: str) -> Optional[str]:
    blob = ((merchant or "") + " " + (description or "")).upper()
    for needle, cat in HEURISTIC_MAP:
        if needle.endswith("*"):
            n = needle[:-1]
            if n and n in blob:
                return cat
        else:
            if needle in blob:
                return cat
    return None

def _dedup_sorted(categories: List[Tuple[str, float]], topk: int) -> List[Tuple[str, float]]:
    seen = set()
    out: List[Tuple[str, float]] = []
    for c, p in categories:
        if c in seen: 
            continue
        seen.add(c)
        out.append((c, float(p)))
        if len(out) >= topk:
            break
    return out

def suggest_for_unknowns(db: Session, month: Optional[str], limit: int = 50, topk: int = 3) -> List[Dict[str, Any]]:
    rows = _fetch_unknowns(db, month, limit)
    if not rows:
        return []

    pipe = load_latest_model()

    results: List[Dict[str, Any]] = []
    if pipe is not None and hasattr(pipe, "predict_proba"):
        # Build features; support both ColumnTransformer(DataFrame) and FeatureUnion(dict) trainers
        texts: List[str] = []
        num0: List[float] = []
        num1: List[float] = []
        for r in rows:
            merchant = (r.get("merchant") or "").strip()
            desc = (r.get("description") or "").strip()
            texts.append((merchant + " " + desc).strip())
            amt = float(r.get("amount") or 0.0)
            num0.append(-1.0 if amt < 0 else 1.0)
            num1.append(math.log1p(abs(amt)))

        # Detect pipeline front-end: ColumnTransformer expects DataFrame; FeatureUnion expects dict
        features = getattr(getattr(pipe, "named_steps", {}), "get", lambda *_: None)("pre")
        if features is None:
            features = getattr(getattr(pipe, "named_steps", {}), "get", lambda *_: None)("features")

        X_input: Any
        if features is not None and features.__class__.__name__ == "ColumnTransformer":
            X_input = pd.DataFrame({"text": texts, "num0": num0, "num1": num1})
        else:
            # Default to dict expected by FeatureUnion(selecting keys 'text' and 'num')
            X_input = {"text": texts, "num": [[a, b] for a, b in zip(num0, num1)]}

        probas = pipe.predict_proba(X_input)  # type: ignore[arg-type]
        # Get class order from final classifier when available
        clf = getattr(getattr(pipe, "named_steps", {}), "get", lambda *_: None)("clf")
        if clf is not None and hasattr(clf, "classes_"):
            classes = clf.classes_.tolist()
        else:
            classes = list(getattr(pipe, "classes_", []))

        for i, r in enumerate(rows):
            pairs = sorted(zip(classes, probas[i].tolist()), key=lambda t: t[1], reverse=True)
            pairs = _dedup_sorted(pairs, topk)
            suggestions = [{"category": c, "confidence": round(p, 6)} for c, p in pairs]
            results.append({
                "txn_id": r["id"],
                "merchant": r.get("merchant"),
                "description": r.get("description"),
                "amount": r.get("amount"),
                "month": r.get("month"),
                "suggestions": suggestions,
                "explain_url": f"/txns/{r['id']}/explain",
            })
        return results

    # Fallback when no model yet
    FALLBACK_BUCKETS = ["Groceries", "Dining out", "Shopping", "Transport", "Subscriptions"]
    for r in rows:
        best = _heuristic_guess(r.get("merchant", ""), r.get("description", ""))
        ordered: List[Tuple[str, float]] = []
        if best:
            ordered.append((best, 0.9))
            ordered += [(c, 0.25) for c in FALLBACK_BUCKETS if c != best]
        else:
            ordered = [(c, 0.34 if idx == 0 else 0.22) for idx, c in enumerate(FALLBACK_BUCKETS)]
        ordered = _dedup_sorted(ordered, topk)
        suggestions = [{"category": c, "confidence": round(p, 6)} for c, p in ordered]
        results.append({
            "txn_id": r["id"], "merchant": r.get("merchant"), "description": r.get("description"),
            "amount": r.get("amount"), "month": r.get("month"),
            "suggestions": suggestions, "explain_url": f"/txns/{r['id']}/explain",
        })
    return results
