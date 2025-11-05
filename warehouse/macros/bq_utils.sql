{% macro json_array_length(column_name) %}
  {# BigQuery has JSON_ARRAY_LENGTH, Postgres has jsonb_array_length #}
  {{ return(adapter.dispatch('json_array_length', 'ledgermind')(column_name)) }}
{% endmacro %}

{% macro default__json_array_length(column_name) %}
  JSON_ARRAY_LENGTH({{ column_name }})
{% endmacro %}

{% macro postgres__json_array_length(column_name) %}
  jsonb_array_length({{ column_name }})
{% endmacro %}

{% macro json_extract_scalar(json_column, json_path) %}
  {# BigQuery: JSON_EXTRACT_SCALAR, Postgres: ->> #}
  {{ return(adapter.dispatch('json_extract_scalar', 'ledgermind')(json_column, json_path)) }}
{% endmacro %}

{% macro default__json_extract_scalar(json_column, json_path) %}
  JSON_EXTRACT_SCALAR({{ json_column }}, '{{ json_path }}')
{% endmacro %}

{% macro postgres__json_extract_scalar(json_column, json_path) %}
  {{ json_column }}::jsonb->>'{{ json_path }}'
{% endmacro %}
