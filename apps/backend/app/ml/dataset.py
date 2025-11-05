"""Dataset loading for ML training.

Loads features + labels from PostgreSQL with temporal split for validation.
Only includes last 180 days to keep training fresh.
"""
from __future__ import annotations
from typing import Tuple, List
import os
import pandas as pd
import sqlalchemy as sa

DB_URL = os.getenv("DATABASE_URL")

# Join features with labels for training
SQL = """
SELECT f.txn_id, f.ts_month, f.amount, f.abs_amount, f.merchant, f.mcc, f.channel,
       f.hour_of_day, f.dow, f.is_weekend, f.is_subscription, f.norm_desc,
       l.label
FROM ml_features f
JOIN transaction_labels l ON l.txn_id = f.txn_id
WHERE f.ts_month >= (CURRENT_DATE - INTERVAL '180 days')
  AND l.label IS NOT NULL
"""


def load_dataframe(limit: int | None = None) -> pd.DataFrame:
    """Load training data from database.
    
    Args:
        limit: Optional row limit for testing
        
    Returns:
        DataFrame with features + label column
    """
    eng = sa.create_engine(DB_URL)
    sql = SQL + ("" if not limit else f" LIMIT {int(limit)}")
    df = pd.read_sql(sql, eng)
    return df


def temporal_split(df: pd.DataFrame, holdout_months: int = 1) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Split data by time for validation.
    
    Uses last N months as validation set to simulate production conditions.
    This prevents data leakage and tests temporal generalization.
    
    Args:
        df: DataFrame with ts_month column
        holdout_months: Number of months to hold out for validation
        
    Returns:
        Tuple of (train_df, val_df)
    """
    last_month = df["ts_month"].max()
    cutoff = (pd.to_datetime(last_month) - pd.offsets.MonthBegin(holdout_months)).date()
    
    train = df[df["ts_month"] < pd.Timestamp(cutoff)]
    val = df[df["ts_month"] >= pd.Timestamp(cutoff)]
    
    return train, val
