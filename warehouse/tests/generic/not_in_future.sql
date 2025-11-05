{% test not_in_future(model, column_name) %}
select
  {{ column_name }} as offending_value
from {{ model }}
where {{ column_name }} > date_trunc('month', current_date)
limit 1
{% endtest %}
