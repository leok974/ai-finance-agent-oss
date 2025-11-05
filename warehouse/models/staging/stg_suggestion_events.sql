{{
  config(
    materialized='view'
  )
}}

WITH events AS (
  SELECT
    id AS event_id,
    txn_id,
    model_id,
    features_hash,
    candidates,
    mode,
    created_at,
    DATE(created_at) AS created_date
  FROM public.suggestion_events
)

SELECT * FROM events
