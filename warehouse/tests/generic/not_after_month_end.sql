{% test not_after_month_end(model, column_name, ts_month_col, ts_label_col) %}
-- Guard: label must be recorded no later than the end of ts_month window
-- This prevents temporal leakage where labels from future months are used
-- to train on past months' transactions.
select
  {{ ts_month_col }} as ts_month_value,
  {{ ts_label_col }} as label_ts_value
from {{ model }}
where {{ ts_label_col }} is not null
  and {{ ts_label_col }} > ({{ ts_month_col }} + interval '1 month' - interval '1 day')
limit 1
{% endtest %}
