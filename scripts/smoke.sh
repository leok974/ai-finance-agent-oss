#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-https://app.ledger-mind.org}"
red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
info() { printf '\033[36m[info]\033[0m %s\n' "$*"; }

fail=0

check() {
  local path="$1"; shift
  local expect_code="$1"; shift
  info "GET $path"
  local http code body
  http=$(curl -sS -w '%{http_code}' -o /tmp/smoke_body "${BASE_URL}${path}" || true)
  code="${http:(-3)}"
  body=$(cat /tmp/smoke_body)
  if [[ "$code" != "$expect_code" ]]; then
    red "[FAIL] $path expected $expect_code got $code"
    echo "$body" | head -c 400
    fail=1
  else
    green "[OK] $path ($code)"
  fi
  # simple crypto mode validation for /ready
  if [[ "$path" == "/ready" && "$body" != "" ]]; then
    if ! grep -q '"mode":"kms"' <<<"$body"; then
      yellow "[WARN] /ready does not report mode=kms"
      fail=1
    fi
  fi
}

check /ready 200
check /api/healthz 200
check /api/openapi.json 200 || true

if [[ $fail -ne 0 ]]; then
  red "Smoke test FAILED"
  exit 1
fi

green "All smoke checks passed"
