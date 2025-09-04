from __future__ import annotations
import os, json, math, datetime as dt
from typing import Any, Dict, List, Optional
from collections import Counter

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
import joblib

MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "models"))
LATEST_MODEL_PATH = os.path.join(MODELS_DIR, "latest.joblib")
LATEST_META_PATH  = os.path.join(MODELS_DIR, "latest.meta.json")

def _ensure_dirs() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)

def _fetch_labeled_rows(db: Session, month: Optional[str]) -> List[Dict[str, Any]]:
    try:
        from app.orm_models import Transaction  # type: ignore
        q = (
            db.query(Transaction)
            .filter(Transaction.category.isnot(None))
            .filter(Transaction.category != "")
            .filter(Transaction.category != "Unknown")
        )
        if month:
            q = q.filter(Transaction.month == month)
        rows = q.all()
        out = []
        for r in rows:
            out.append(dict(
                id=r.id,
                merchant=(r.merchant or "")[:200],
                description=(r.description or "")[:500],
                amount=float(r.amount or 0.0),
                category=r.category,
                date=str(getattr(r, "date", "")),
                month=str(getattr(r, "month", "")),
            ))
        return out
    except Exception:
        where = "WHERE category IS NOT NULL AND category <> '' AND category <> 'Unknown'"
        params: Dict[str, Any] = {}
        if month:
            where += " AND month = :m"
            params["m"] = month
        sql = f"""
        SELECT id, merchant, description, amount, category, date, month
        FROM transactions
        {where}
        """
        res = db.execute(sql_text(sql), params).mappings().all()
        return [dict(r) for r in res]

def _rows_to_df(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    texts = []
    num0 = []  # sign
    num1 = []  # log1p(abs(amount))
    cats = []
    for r in rows:
        merchant = (r.get("merchant") or "").strip()
        desc = (r.get("description") or "").strip()
        texts.append((merchant + " " + desc).strip())
        amt = float(r.get("amount") or 0.0)
        num0.append(-1.0 if amt < 0 else 1.0)
        num1.append(math.log1p(abs(amt)))
        cats.append(r["category"])
    return pd.DataFrame({"text": texts, "num0": num0, "num1": num1, "y": cats})

def _make_pipeline() -> Pipeline:
    pre = ColumnTransformer(
        transformers=[
            ("text", TfidfVectorizer(ngram_range=(1, 2), max_features=50000, lowercase=True, strip_accents="unicode"), "text"),
            ("num",  StandardScaler(with_mean=False), ["num0", "num1"]),
        ],
        remainder="drop",
        sparse_threshold=0.3,
    )
    clf = LogisticRegression(
        solver="lbfgs",
        max_iter=200,
        class_weight="balanced",
    )
    return Pipeline(steps=[("pre", pre), ("clf", clf)])

def load_latest_model() -> Optional[Pipeline]:
    if not os.path.exists(LATEST_MODEL_PATH):
        return None
    try:
        return joblib.load(LATEST_MODEL_PATH)
    except Exception:
        return None

def latest_meta() -> Dict[str, Any]:
    if not os.path.exists(LATEST_META_PATH):
        return {"status": "empty"}
    try:
        with open(LATEST_META_PATH, "r", encoding="utf-8") as f:
            meta = json.load(f)
        return {"status": "ok", **meta}
    except Exception as e:
        return {"status": "error", "error": f"{type(e).__name__}: {e}"}

def train_on_db(
    db: Session,
    month: Optional[str] = None,
    min_samples: int = 25,
    test_size: float = 0.2,
    random_state: int = 42,
) -> Dict[str, Any]:
    try:
        _ensure_dirs()

        rows = _fetch_labeled_rows(db, month)
        n = len(rows)
        if n < min_samples:
            return {"status": "skipped",
                    "reason": f"not_enough_labeled_samples ({n} < {min_samples})",
                    "labeled_count": n, "month": month}

        df = _rows_to_df(rows)
        y = df["y"].tolist()
        classes = sorted(set(y))
        if len(classes) < 2:
            return {"status": "skipped",
                    "reason": "need_at_least_2_classes_overall",
                    "labeled_count": n, "month": month, "classes": classes}

        counts = Counter(y)
        min_per_class = min(counts.values())
        do_split = (n >= 6) and (min_per_class >= 2)

        if do_split:
            ts = 0.15 if n >= 10 else max(0.1, min(0.2, 1.0 / max(2, n)))
            try:
                df_tr, df_te = train_test_split(df, test_size=ts, random_state=random_state, stratify=df["y"])
            except ValueError:
                df_tr, df_te = train_test_split(df, test_size=ts, random_state=random_state, stratify=None)
        else:
            df_tr, df_te = df, df.iloc[0:0]  # empty test

        if len(set(df_tr["y"])) < 2:
            return {"status": "skipped",
                    "reason": "need_at_least_2_classes_in_train_split",
                    "labeled_count": n, "month": month}

        X_train = df_tr[["text", "num0", "num1"]]
        y_train = df_tr["y"]
        X_test  = df_te[["text", "num0", "num1"]]
        y_test  = df_te["y"]

        pipe = _make_pipeline()
        try:
            pipe.fit(X_train, y_train)
        except ValueError as e:
            return {"status": "skipped",
                    "reason": f"train_fit_error: {e}",
                    "labeled_count": n, "month": month}

        acc = f1m = None
        if len(y_test) > 0:
            try:
                y_pred = pipe.predict(X_test)
                acc = float(accuracy_score(y_test, y_pred))
                if len(set(y_test)) > 1:
                    f1m = float(f1_score(y_test, y_pred, average="macro"))
            except Exception:
                pass

        ts_utc = dt.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        model_path = os.path.join(MODELS_DIR, f"model_{ts_utc}.joblib")
        joblib.dump(pipe, model_path)
        try:
            if os.path.exists(LATEST_MODEL_PATH):
                os.remove(LATEST_MODEL_PATH)
            joblib.dump(pipe, LATEST_MODEL_PATH)
        except Exception:
            pass

        meta = {
            "model_path": model_path,
            "latest_path": LATEST_MODEL_PATH,
            "trained_at": ts_utc,
            "month": month,
            "labeled_count": n,
            "classes": classes,
            "metrics": {"accuracy": acc, "macro_f1": f1m},
        }
        with open(LATEST_META_PATH, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

        return {"status": "ok", **meta}
    except Exception as e:
        return {"status": "error", "error": f"{e}", "error_type": type(e).__name__}
