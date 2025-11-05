#!/usr/bin/env sh
set -e

# Robust CSP hash rendering with explicit no-inline-scripts branch.
# Always writes transformed config to /tmp/nginx.conf so the rootfs can be read-only.

CONF_SRC="${CONF_SRC:-/etc/nginx/nginx.conf}"
if [ -f /etc/nginx/conf.d/app.conf ]; then CONF_SRC="/etc/nginx/conf.d/app.conf"; fi
CONF_OUT="/tmp/nginx.conf"
PLACE="__INLINE_SCRIPT_HASHES__"
CONF_VER_PLACE="__CONFIG_VERSION__"
HTML="/usr/share/nginx/html/index.html"

# Fresh copy every invocation (keeps logic simple & idempotent)
cp "$CONF_SRC" "$CONF_OUT"

MODE="runtime"
if [ "${1:-}" = "--build" ]; then MODE="build"; fi

HASHES=""
if [ -f "$HTML" ]; then
  # Extract inline <script> blocks, hash contents
  # Uses awk to split on </script>, then sed to isolate inner content
  while IFS= read -r block; do
    # Skip if block is empty after trimming whitespace
    [ -n "$(printf "%s" "$block" | tr -d '\r\n\t ')" ] || continue
    h=$(printf "%s" "$block" | openssl dgst -sha256 -binary | openssl base64 -A)
    HASHES="$HASHES 'sha256-$h'"
  done <<EOF
$(awk 'BEGIN{RS="</script>";FS="<script"} NR>1 {print $2}' "$HTML" | sed -n 's/^[^>]*>//p')
EOF
else
  echo "[csp] $HTML missing; treating as no inline scripts" >&2
fi

# Placeholder / injection logic
if [ -z "${HASHES:-}" ]; then
  # No inline scripts -> remove placeholder entirely (if present) and normalize spacing
  sed -i "s|$PLACE||g" "$CONF_OUT" 2>/dev/null || true
  sed -i "s|script-src 'self'  *|script-src 'self' |" "$CONF_OUT" 2>/dev/null || true
  echo "[csp] ($MODE) no inline scripts; placeholder removed" >&2
else
  if grep -q "$PLACE" "$CONF_OUT" 2>/dev/null; then
    sed -i "s|$PLACE|$HASHES|g" "$CONF_OUT" || { echo "[csp][ERROR] substitution failed" >&2; exit 1; }
    echo "[csp] ($MODE) replaced placeholder with hashes: $HASHES" >&2
  else
    # Inject hashes right after first occurrence of script-src 'self'
    if grep -q "script-src 'self'" "$CONF_OUT"; then
      sed -i "0,/script-src 'self'/s//script-src 'self' $HASHES/" "$CONF_OUT" || { echo "[csp][ERROR] injection failed" >&2; exit 1; }
      echo "[csp] ($MODE) injected hashes after script-src: $HASHES" >&2
    else
      echo "[csp][WARN] script-src 'self' directive not found; cannot inject hashes" >&2
    fi
  fi
fi

# Config version substitution (retained from prior implementation)
if grep -q "$CONF_VER_PLACE" "$CONF_OUT" 2>/dev/null; then
  if [ -f "$HTML" ]; then
    ver_hash=$( (sha256sum "$HTML" 2>/dev/null || shasum -a 256 "$HTML") | awk '{print $1}' | cut -c1-12 )
    assets_ct=$(find /usr/share/nginx/html/assets -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
    ver="${ver_hash}-${assets_ct}"
  else
    ver="nohtml"
  fi
  sed -i "s|$CONF_VER_PLACE|$ver|g" "$CONF_OUT" || echo "[csp][WARN] config version substitution failed" >&2
  echo "[csp] config version=$ver" >&2
fi

echo "[csp] rendered to $CONF_OUT" >&2
