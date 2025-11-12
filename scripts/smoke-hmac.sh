#!/usr/bin/env bash
# HMAC Smoke Test (Bash)
# Fast deterministic smoke test using HMAC auth + stub mode
# Tests: signature generation, stub mode, echo mode

set -euo pipefail

BASE_URL="${BASE_URL:-https://app.ledger-mind.org}"
AGENT_PATH="${AGENT_PATH:-/agent/chat}"
CLIENT_ID="${E2E_USER:-${HMAC_CLIENT_ID:-}}"
SECRET="${E2E_SESSION_HMAC_SECRET:-${HMAC_SECRET:-}}"

if [[ -z "$CLIENT_ID" ]] || [[ -z "$SECRET" ]]; then
    echo "ERROR: Missing credentials. Set E2E_USER/E2E_SESSION_HMAC_SECRET or HMAC_CLIENT_ID/HMAC_SECRET"
    exit 1
fi

sha256_hex() {
    echo -n "$1" | openssl dgst -sha256 -hex | awk '{print $2}'
}

hmac_signature() {
    local method="$1"
    local path="$2"
    local body="$3"
    local timestamp="$4"

    local body_hash=$(sha256_hex "$body")
    local canonical="${method^^}"$'\n'"$path"$'\n'"$timestamp"$'\n'"$body_hash"
    echo -n "$canonical" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}'
}

invoke_hmac_request() {
    local url="$1"
    local path="$2"
    local payload="$3"
    local test_mode="$4"

    local timestamp=$(date +%s%3N)
    local signature=$(hmac_signature "POST" "$path" "$payload" "$timestamp")

    local start=$(date +%s%3N)
    local response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
        -H "X-Client-Id: $CLIENT_ID" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Signature: $signature" \
        -H "Content-Type: application/json" \
        -H "x-test-mode: $test_mode" \
        -d "$payload")
    local end=$(date +%s%3N)
    local latency=$((end - start))

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')

    echo "$http_code|$latency|$body"
}

echo ""
echo "=== HMAC Smoke Test ==="
echo "URL: $BASE_URL$AGENT_PATH"
echo "Client: $CLIENT_ID"
echo ""

url="$BASE_URL$AGENT_PATH"
passed=0
failed=0

# Test 1: Stub mode
echo -n "[1/3] Testing stub mode..."
payload='{"messages":[{"role":"user","content":"ping"}],"context":{"month":"2025-08"}}'
result=$(invoke_hmac_request "$url" "$AGENT_PATH" "$payload" "stub")
http_code=$(echo "$result" | cut -d'|' -f1)
latency=$(echo "$result" | cut -d'|' -f2)
body=$(echo "$result" | cut -d'|' -f3-)

if [[ "$http_code" == "200" ]] && echo "$body" | grep -qi "deterministic test reply"; then
    echo " ✓ PASS (${latency}ms)"
    ((passed++))
else
    echo " ✗ FAIL (HTTP $http_code)"
    ((failed++))
fi

# Test 2: Echo mode
echo -n "[2/3] Testing echo mode..."
payload='{"messages":[{"role":"user","content":"test echo"}],"context":{"month":"2025-08"}}'
result=$(invoke_hmac_request "$url" "$AGENT_PATH" "$payload" "echo")
http_code=$(echo "$result" | cut -d'|' -f1)
latency=$(echo "$result" | cut -d'|' -f2)
body=$(echo "$result" | cut -d'|' -f3-)

if [[ "$http_code" == "200" ]] && echo "$body" | grep -q "\[echo\] test echo"; then
    echo " ✓ PASS (${latency}ms)"
    ((passed++))
else
    echo " ✗ FAIL (HTTP $http_code)"
    ((failed++))
fi

# Test 3: Path compatibility
if [[ "$AGENT_PATH" == "/agent/chat" ]]; then
    alt_path="/api/agent/chat"
else
    alt_path="/agent/chat"
fi
alt_url="$BASE_URL$alt_path"

echo -n "[3/3] Testing path compatibility ($alt_path)..."
payload='{"messages":[{"role":"user","content":"ping"}]}'
result=$(invoke_hmac_request "$alt_url" "$alt_path" "$payload" "stub")
http_code=$(echo "$result" | cut -d'|' -f1)
latency=$(echo "$result" | cut -d'|' -f2)

if [[ "$http_code" == "200" ]]; then
    echo " ✓ PASS (${latency}ms)"
    ((passed++))
else
    echo " ✗ FAIL (expected - nginx may not expose both paths)"
    # Don't count as failure - this is optional
fi

echo ""
echo "=== Results ==="
echo "Passed: $passed"
echo "Failed: $failed"

if [[ $failed -gt 0 ]]; then
    exit 1
fi
