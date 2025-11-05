{{
  config(
    materialized='incremental',
    unique_key='created_date',
    on_schema_change='sync_all_columns'
  )
}}

-- Incremental feedback aggregation
-- Gracefully handles missing suggestion_feedback table

{% if execute and adapter.get_relation(
      database=target.database, schema=target.schema, identifier='suggestion_feedback') %}
  select
    f.created_at::date as created_date,
    count(*) as feedback_events,
    sum(case when f.action = 'accept' then 1 else 0 end) as accepts,
    sum(case when f.action = 'reject' then 1 else 0 end) as rejects,
    case 
      when sum(case when f.action in ('accept', 'reject') then 1 else 0 end) > 0
      then sum(case when f.action = 'accept' then 1 else 0 end)::float / 
           nullif(sum(case when f.action in ('accept', 'reject') then 1 else 0 end), 0)
      else null
    end as accept_rate
  from {{ source('app','suggestion_feedback') }} f
  {% if is_incremental() %}
  where f.created_at::date >= (select coalesce(max(created_date), '1900-01-01'::date) from {{ this }})
  {% endif %}
  group by 1
{% else %}
  -- fallback empty frame so downstream refs don't break
  select
    current_date::date as created_date,
    0::int as feedback_events,
    0::int as accepts,
    0::int as rejects,
    null::float as accept_rate
  where false
{% endif %}
