{{
  config(
    materialized='view',
    tags=['ml', 'training']
  )
}}

/*
Staging layer for transaction labels (golden truth).
Used for ML training and evaluation.
*/

select
    txn_id,
    label,
    source,
    created_at,
    updated_at
from {{ source('app', 'transaction_labels') }}
