#!/usr/bin/env sh
# verify-csp.sh
# Lightweight CSP header & inline script hash verification.
# Usage: ./scripts/verify-csp.sh [URL]
# Default URL: http://127.0.0.1/
# Exits non-zero on failure; prints PASS summary on success.
set -eu
URL="${1:-http://127.0.0.1/}"
TMP_HTML="$(mktemp 2>/dev/null || echo /tmp/csp.$$)"

fail() { echo "[verify-csp][FAIL] $1" >&2; rm -f "$TMP_HTML" 2>/dev/null || true; exit 1; }
info() { echo "[verify-csp] $1"; }

info "Fetching headers: $URL"
headers=$(curl -sI "$URL" || true)
[ -n "$headers" ] || fail "No headers returned"

csp=$(printf "%s" "$headers" | awk 'BEGIN{IGNORECASE=1} /^Content-Security-Policy:/ {sub(/^[^:]*:[ ]*/,"",$0);print;exit}')
[ -n "$csp" ] || fail "Missing Content-Security-Policy header"

echo "$csp" | grep -q "__INLINE_SCRIPT_HASHES__" && fail "Placeholder __INLINE_SCRIPT_HASHES__ still present"

echo "$csp" | grep -q "'unsafe-inline'" && fail "'unsafe-inline' unexpectedly present in script-src"

# Extract script-src tokens
script_src=$(printf "%s" "$csp" | sed -n "s/.*script-src \([^;]*\).*/\1/p")
[ -n "$script_src" ] || fail "Could not parse script-src directive"

# Collect existing hashes
hash_count=$(printf "%s" "$script_src" | tr ' ' '\n' | grep -c "^'sha256-" || true)

# Fetch document to count inline scripts
info "Fetching document body for inline script analysis"
curl -s "$URL" > "$TMP_HTML" || fail "Failed to fetch document"

# Rough inline script count: <script ...>...</script> where there's no src attribute.
inline_count=$(grep -o "<script[^>]*>" "$TMP_HTML" | grep -vi src | wc -l | awk '{print $1}')

info "Inline scripts: $inline_count | Hash tokens: $hash_count"

if [ "$inline_count" -eq 0 ]; then
  [ "$hash_count" -eq 0 ] || fail "Expected zero hashes (no inline scripts), found $hash_count"
else
  [ "$hash_count" -ge "$inline_count" ] || fail "Insufficient hashes: have $hash_count need >= $inline_count"
fi

info "PASS: CSP header valid for $URL"
rm -f "$TMP_HTML" 2>/dev/null || true
