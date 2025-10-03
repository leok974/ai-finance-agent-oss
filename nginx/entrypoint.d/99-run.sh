#!/usr/bin/env sh
set -euo pipefail
CONF="/tmp/nginx.conf"
if [ ! -f "$CONF" ]; then
  echo "[nginx][WARN] temp config $CONF missing; copying original"
  if [ -f /etc/nginx/conf.d/app.conf ]; then
    cp /etc/nginx/conf.d/app.conf "$CONF"
  else
    cp /etc/nginx/nginx.conf "$CONF"
  fi
fi
# Show first server block line for debug
head -n 40 "$CONF" | sed -n '1,5p' >/dev/null 2>&1 || true
echo "[nginx] starting with config $CONF (readonly rootfs supported)"
exec nginx -g 'daemon off;' -c "$CONF"
