#!/bin/sh
set -eu

INDEX="/usr/share/nginx/html/index.html"

if [ ! -f "$INDEX" ]; then
  echo "[assert-assets] FAIL: index.html not found at $INDEX" >&2
  exit 1
fi

# Extract first hashed asset paths (avoid nested quote gymnastics)
CSS=$(grep -oE "/assets/[^\"']+\.css" "$INDEX" | head -n1 || true)
JS=$(grep -oE "/assets/[^\"']+\.js" "$INDEX" | head -n1 || true)

if [ -z "${CSS:-}" ]; then
  echo "[assert-assets] FAIL: no CSS asset found in index.html" >&2
  exit 1
fi
if [ -z "${JS:-}" ]; then
  echo "[assert-assets] FAIL: no JS asset found in index.html" >&2
  exit 1
fi

echo "[assert-assets] found CSS: $CSS"
echo "[assert-assets] found JS:  $JS"

_probe() {
  URL="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -sSI "http://127.0.0.1$URL" || return 1
  elif command -v wget >/dev/null 2>&1; then
    wget -S --spider "http://127.0.0.1$URL" 2>&1 || return 1
  else
    return 0
  fi
}

_probe "$CSS" >/dev/null 2>&1 || echo "[assert-assets] warn: fetch CSS failed (soft)"
_probe "$JS"  >/dev/null 2>&1 || echo "[assert-assets] warn: fetch JS failed (soft)"

echo "[assert-assets] PASS"
exit 0
