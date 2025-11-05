{{
  config(
    materialized='table',
    on_schema_change='sync_all_columns'
  )
}}

-- KPIs over 30-day rolling window

with daily as (
  select * from {{ ref('mart_suggestions_daily') }}
)
select
  max(created_date) as as_of_date,
  sum(suggestions) as suggestions_30d,
  sum(model_suggestions) as model_suggestions_30d,
  sum(heuristic_suggestions) as heur_suggestions_30d,
  sum(auto_suggestions) as auto_suggestions_30d
from daily
where created_date >= current_date - interval '30 day'
