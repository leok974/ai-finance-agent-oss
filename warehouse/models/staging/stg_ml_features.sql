{{
  config(
    materialized='view',
    tags=['ml', 'training']
  )
}}

/*
Staging layer for ML feature vectors.
Features are point-in-time (computed at transaction time) to prevent data leakage.
*/

select
    txn_id,
    ts_month,
    amount,
    abs_amount,
    merchant,
    mcc,
    channel,
    hour_of_day,
    dow,
    is_weekend,
    is_subscription,
    norm_desc,
    tokens
from {{ source('app', 'ml_features') }}
