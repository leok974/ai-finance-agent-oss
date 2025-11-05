{% macro day_floor(ts) -%}
  {{ ts }}::date
{%- endmacro %}

{% macro json_length(expr) -%}
  {% if target.type == 'bigquery' %}
    json_array_length({{ expr }})
  {% else %}
    json_array_length({{ expr }}::json)
  {% endif %}
{%- endmacro %}
