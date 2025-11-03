#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1}"

printf '== Analytics smoke against %s\n' "$BASE_URL"

payload='{"event":"smoke","props":{"email":"alice@example.com","note":"ok"}}'
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/agent/analytics/event" -H 'content-type: application/json' --data "$payload")
if [ "$code" != "204" ]; then
  echo "ERROR: POST => $code" >&2
  exit 1
fi

metrics=$(curl -s "$BASE_URL/metrics" || true)
if [ -z "$metrics" ]; then
  echo "ERROR: failed to fetch /metrics" >&2
  exit 1
fi

event_count=$(echo "$metrics" | grep -c 'analytics_events_total{event="smoke"}') || true
scrub_present=$(echo "$metrics" | grep -c '^analytics_scrubbed_fields_total') || true

if [ "$event_count" -lt 1 ]; then
  echo "ERROR: no analytics_events_total for smoke" >&2
  exit 1
fi
if [ "$scrub_present" -lt 1 ]; then
  echo "ERROR: no analytics_scrubbed_fields_total counter" >&2
  exit 1
fi

echo "OK: event + scrub counters present"
