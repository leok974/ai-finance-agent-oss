{{
  config(
    materialized='view',
    tags=['core']
  )
}}

/*
Staging layer for transactions.
Provides consistent field names and types for downstream models.
*/

select
    id as txn_id,
    date as txn_date,
    amount,
    category as current_category,
    merchant,
    merchant_canonical,
    description,
    month,
    created_at,
    updated_at,
    deleted_at
from {{ source('app', 'transactions') }}
where deleted_at is null  -- Only active transactions
