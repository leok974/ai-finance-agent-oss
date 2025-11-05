{{
  config(
    materialized='incremental',
    unique_key='created_date',
    on_schema_change='sync_all_columns'
  )
}}

-- Daily aggregation of suggestion events with incremental updates

select
  s.created_date,
  count(*) as suggestions,
  sum(case when s.mode = 'model' then 1 else 0 end) as model_suggestions,
  sum(case when s.mode = 'heuristic' then 1 else 0 end) as heuristic_suggestions,
  sum(case when s.mode = 'auto' then 1 else 0 end) as auto_suggestions,
  count(distinct s.txn_id) as txn_count,
  count(distinct s.model_id) as distinct_models
from {{ ref('stg_suggestion_events') }} s
{% if is_incremental() %}
where s.created_date >= (select coalesce(max(created_date), '1900-01-01'::date) from {{ this }})
{% endif %}
group by 1
