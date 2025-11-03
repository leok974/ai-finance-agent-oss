#!/usr/bin/env sh
set -eu

if (set -o pipefail 2>/dev/null); then
  set -o pipefail
fi

CONF="${NGINX_RUNTIME_CONF:-/var/run/nginx-runtime/nginx.conf}"
mkdir -p "$(dirname "$CONF")"
if [ ! -f "$CONF" ]; then
  echo "[nginx][WARN] temp config $CONF missing; copying original"
  if [ -f /etc/nginx/conf.d/app.conf ]; then
    cp /etc/nginx/conf.d/app.conf "$CONF"
  else
    cp /etc/nginx/nginx.conf "$CONF"
  fi
fi

# Sanity check: ensure no CSP placeholder in active config
echo "[nginx] sanity: checking for CSP placeholders in active config"
if nginx -T 2>/dev/null | grep -q "__INLINE_SCRIPT_HASHES__"; then
  echo "[nginx] ERROR: CSP placeholder detected in active config!"
  nginx -T 2>&1 | grep -n "Content-Security-Policy" || true
  exit 1
fi
echo "[nginx] ✓ CSP sanity check passed"

# Show first server block line for debug
head -n 40 "$CONF" | sed -n '1,5p' >/dev/null 2>&1 || true
echo "[nginx] starting with config $CONF (readonly rootfs supported)"
exec nginx -g 'daemon off;' -c "$CONF"
