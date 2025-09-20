from __future__ import annotations
import os, json, math, datetime as dt
from app.utils.time import utc_now
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
from sklearn.linear_model import SGDClassifier
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
        from app.transactions import Transaction  # type: ignore
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
    # SGD with log_loss approximates logistic regression and supports partial_fit for incremental updates
    clf = SGDClassifier(
        loss="log_loss",
        alpha=1e-4,
        max_iter=5,
        tol=None,
        random_state=42,
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

        ts_utc = utc_now().strftime("%Y%m%dT%H%M%SZ")
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


# ---------- Incremental update (best-effort) ----------
def _load_pipeline() -> Pipeline:
    """Load the latest pipeline or raise if missing."""
    if not os.path.exists(LATEST_MODEL_PATH):
        raise FileNotFoundError(f"No model at {LATEST_MODEL_PATH}")
    pipe = joblib.load(LATEST_MODEL_PATH)
    return pipe


def _save_pipeline(pipe: Pipeline) -> None:
    """Atomically save pipeline to latest path via a tmp file."""
    tmp = LATEST_MODEL_PATH + ".tmp"
    joblib.dump(pipe, tmp)
    try:
        if os.path.exists(LATEST_MODEL_PATH):
            os.remove(LATEST_MODEL_PATH)
    except Exception:
        # best-effort; proceed to replace
        pass
    os.replace(tmp, LATEST_MODEL_PATH)


def incremental_update(texts: List[str], labels: List[str]) -> Dict[str, Any]:
    """
    Perform partial_fit on the pipeline's classifier if supported.
    Assumes the pipeline ends with a classifier that implements partial_fit.

    Inputs:
    - texts: list of transaction text (merchant + description)
    - labels: list of categories (same length as texts)

    Returns: { updated: bool, reason?: str, classes?: list[str] }
    """
    if not texts or not labels or len(texts) != len(labels):
        return {"updated": False, "reason": "invalid_inputs"}

    pipe = _load_pipeline()
    # Get classifier (last step)
    clf = None
    try:
        clf = pipe.named_steps.get("clf")  # type: ignore[attr-defined]
    except Exception:
        pass
    if clf is None and hasattr(pipe, "steps") and pipe.steps:
        clf = pipe.steps[-1][1]

    if not hasattr(clf, "partial_fit"):
        return {"updated": False, "reason": "classifier_has_no_partial_fit"}

    # Determine whether this is the first call (no classes_ yet)
    existing_classes = getattr(clf, "classes_", None)
    is_first_fit = existing_classes is None
    if is_first_fit:
        # On first fit, compute classes from provided labels
        classes_ = np.array(sorted(list(set(labels))))
        if classes_.size == 0:
            return {"updated": False, "reason": "no_labels_to_initialize_classes"}
        labels_to_use = labels
        texts_to_use = texts
    else:
        # If model is already initialized, ensure ALL incoming labels are known; otherwise reject with hint.
        known = set(existing_classes.tolist()) if hasattr(existing_classes, "tolist") else set(existing_classes)
        new_labels = sorted(list(set(labels) - known))
        if new_labels:
            return {
                "updated": False,
                "reason": "label_not_in_model",
                "missing_labels": new_labels,
                "known_classes": sorted(list(known)),
            }
        labels_to_use = labels
        texts_to_use = texts

    # Build a minimal DataFrame to satisfy the pipeline's preprocessor
    # Our pipeline expects columns: text, num0, num1
    # Use only the subset we kept (or all when first fit)
    tx = texts_to_use
    n = len(tx)
    X_df = pd.DataFrame({
        "text": tx,
        "num0": np.zeros(n, dtype=float),
        "num1": np.zeros(n, dtype=float),
    })

    # Transform with preprocessor if available
    Xt = X_df
    pre = None
    try:
        pre = pipe.named_steps.get("pre")  # type: ignore[attr-defined]
    except Exception:
        pass
    if pre is not None and hasattr(pre, "transform"):
        Xt = pre.transform(X_df)
    elif hasattr(pipe, "__getitem__"):
        try:
            pre_only = pipe[:-1]  # slice pipeline excluding last step
            if hasattr(pre_only, "transform"):
                Xt = pre_only.transform(X_df)
        except Exception:
            pass

    # Update classifier incrementally
    if is_first_fit:
        clf.partial_fit(Xt, labels_to_use, classes=classes_)
    else:
        # Do not pass classes once the classifier is initialized
        clf.partial_fit(Xt, labels_to_use)
    _save_pipeline(pipe)
    try:
        out_classes = list(getattr(clf, "classes_", classes_))
    except Exception:
        out_classes = list(classes_)
    return {"updated": True, "classes": out_classes}
