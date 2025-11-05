{{
  config(
    materialized='table',
    tags=['ml', 'analytics']
  )
}}

/*
Merchant dimension: Aggregated statistics for heuristics and priors.

Provides merchant-level insights for:
- Heuristic rules (most common category per merchant)
- Bayesian priors (category distribution)
- Confidence scoring (consistency metrics)
*/

with labeled_transactions as (
    select * from {{ ref('fct_training_view') }}
),

merchant_stats as (
    select
        coalesce(merchant_canonical, merchant) as merchant_name,
        target_label as category,
        count(*) as transaction_count,
        sum(abs_amount) as total_volume,
        avg(abs_amount) as avg_amount,
        min(txn_date) as first_seen,
        max(txn_date) as last_seen,
        count(distinct case when label_source = 'human' then txn_id end) as human_labels,
        count(distinct case when is_subscription then txn_id end) as subscription_count
    from labeled_transactions
    group by 1, 2
),

merchant_totals as (
    select
        merchant_name,
        sum(transaction_count) as total_transactions,
        sum(total_volume) as merchant_volume,
        count(distinct category) as category_count
    from merchant_stats
    group by 1
)

select
    ms.merchant_name,
    ms.category,
    ms.transaction_count,
    ms.total_volume,
    ms.avg_amount,
    ms.first_seen,
    ms.last_seen,
    ms.human_labels,
    ms.subscription_count,
    
    -- Merchant totals (for ratio calculations)
    mt.total_transactions as merchant_total_txns,
    mt.merchant_volume,
    mt.category_count as merchant_category_count,
    
    -- Prior probability (category ratio for this merchant)
    round(ms.transaction_count::numeric / nullif(mt.total_transactions, 0), 4) as category_prior,
    
    -- Confidence metrics
    case
        when mt.category_count = 1 then 'high'        -- Only one category
        when ms.transaction_count >= 10 then 'high'   -- Many samples
        when ms.transaction_count >= 3 then 'medium'
        else 'low'
    end as confidence,
    
    -- Quality flags
    ms.human_labels > 0 as has_human_labels,
    ms.subscription_count > 0 as is_subscription_merchant

from merchant_stats ms
inner join merchant_totals mt on ms.merchant_name = mt.merchant_name

order by ms.merchant_name, ms.transaction_count desc
