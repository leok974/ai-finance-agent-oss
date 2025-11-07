{{
  config(
    materialized='incremental',
    unique_key='eval_id',
    tags=['ml', 'evaluation']
  )
}}

/*
Model evaluation fact table: Joins predictions with ground truth.

Tracks model performance over time by comparing:
- Suggestion events (predictions from heuristics or ML)
- Feedback (accept/reject actions)
- Labels (ground truth categories)

Used for:
- A/B testing (heuristic vs model performance)
- Model monitoring (F1, precision, recall by date)
- Error analysis (which categories are confused)
*/

with suggestions as (
    select * from {{ ref('stg_suggestion_events') }}
    {% if is_incremental() %}
    where created_at > (select max(suggested_at) from {{ this }})
    {% endif %}
),

feedback as (
    select * from {{ source('app', 'suggestion_feedback') }}
),

labels as (
    select * from {{ ref('stg_transaction_labels') }}
),

transactions as (
    select * from {{ ref('stg_transactions') }}
)

select
    -- Primary key
    {{ dbt_utils.generate_surrogate_key(['s.id', 'f.id']) }} as eval_id,

    -- Foreign keys
    s.id as suggestion_event_id,
    s.txn_id,
    f.id as feedback_id,

    -- Suggestion details
    s.mode as suggestion_mode,
    s.model_id,
    s.features_hash,
    s.candidates as suggested_categories,
    s.created_at as suggested_at,
    s.confidence,
    s.reason_json,
    s.accepted as suggestion_accepted,
    s.source as suggestion_source,
    s.model_version,

    -- Feedback
    f.action as user_action,
    f.label as user_selected_label,
    f.confidence as user_confidence,
    f.reason as user_reason,
    f.created_at as feedback_at,

    -- Ground truth (if available)
    l.label as true_label,
    l.source as label_source,

    -- Transaction context
    t.txn_date,
    t.amount,
    t.merchant,
    t.current_category,

    -- Evaluation metrics (computed)
    case
        when f.action = 'accept' then 1
        when f.action = 'reject' then 0
        else null
    end as is_accepted,

    case
        when f.action = 'accept' and l.label = f.label then 1
        when f.action = 'accept' and l.label != f.label then 0
        else null
    end as is_correct_accept,

    case
        when f.action = 'reject' and l.label = f.label then 0  -- Rejected good suggestion
        when f.action = 'reject' and l.label != f.label then 1  -- Rejected bad suggestion
        else null
    end as is_correct_reject

from suggestions s
left join feedback f on s.id = f.event_id
left join labels l on s.txn_id = l.txn_id
left join transactions t on s.txn_id = t.txn_id
