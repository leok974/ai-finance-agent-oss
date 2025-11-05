"""Feature encoding pipeline for ML model.

Transforms raw transaction features into model-ready sparse matrix:
- Text: TF-IDF hashing (262k features)
- Categorical: One-hot encoding (merchant, channel, MCC)
- Numerical: Passthrough (amount, temporal features)
"""
from __future__ import annotations
from typing import List, Tuple
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import numpy as np

# Feature columns (must match ml_features table)
TEXT_COL = "norm_desc"
CAT_COLS = ["merchant", "channel", "mcc"]
NUM_COLS = ["abs_amount", "hour_of_day", "dow", "is_weekend", "is_subscription"]


def build_preprocessor() -> ColumnTransformer:
    """Build sklearn ColumnTransformer for feature encoding.
    
    Returns:
        ColumnTransformer with text hashing, one-hot encoding, and numeric passthrough
    """
    text = ("text", HashingVectorizer(n_features=2**18, alternate_sign=False), TEXT_COL)
    cat = ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=True), CAT_COLS)
    num = ("num", "passthrough", NUM_COLS)
    
    return ColumnTransformer([text, cat, num], sparse_threshold=0.3)
