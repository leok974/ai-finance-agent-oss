{{
  config(
    materialized='table',
    tags=['ml', 'training']
  )
}}

/*
Training view: Features + Labels with leakage prevention.

This table joins features with labels for ML training, ensuring:
1. No data leakage (only uses point-in-time features)
2. Time-based splits (via ts_month buckets)
3. Excludes recent transactions (to avoid training on incomplete data)

Usage:
  - Split by ts_month for temporal cross-validation
  - Filter out last N days before training (e.g., WHERE ts_month < '2025-10-01')
  - Use label_source to weight training samples (human > rule > import)
*/

with features as (
    select * from {{ ref('stg_ml_features') }}
),

labels as (
    select * from {{ ref('stg_transaction_labels') }}
),

transactions as (
    select * from {{ ref('stg_transactions') }}
)

select
    t.txn_id,
    t.txn_date,
    t.amount,
    t.merchant,
    t.merchant_canonical,
    t.description,
    t.current_category,
    
    -- Features (point-in-time)
    f.ts_month,
    f.abs_amount,
    f.mcc,
    f.channel,
    f.hour_of_day,
    f.dow,
    f.is_weekend,
    f.is_subscription,
    f.norm_desc,
    f.tokens,
    
    -- Label (ground truth)
    l.label as target_label,
    l.source as label_source,
    l.created_at as label_created_at,
    l.created_at as label_observed_at,  -- Alias for leakage tests
    
    -- Metadata
    t.created_at as txn_created_at

from transactions t
inner join features f on t.txn_id = f.txn_id
inner join labels l on t.txn_id = l.txn_id

-- Quality filters
where 1=1
    and f.merchant is not null  -- Require merchant for training
    and l.label is not null     -- Require label
    and t.amount != 0           -- Skip zero-amount transactions
