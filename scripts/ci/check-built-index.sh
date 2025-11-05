#!/usr/bin/env bash
set -euo pipefail
INDEX="apps/web/dist/index.html"
if [ ! -f "$INDEX" ]; then
  echo "ERROR: Missing $INDEX (did the web build run?)" >&2
  exit 2
fi
if grep -q "/src/main.tsx" "$INDEX"; then
  echo "ERROR: Dev index detected in $INDEX (references /src/main.tsx). Run: pnpm -C apps/web build" >&2
  exit 3
fi
# Optional: ensure at least one CSS asset exists
if ! ls apps/web/dist/assets/*.css >/dev/null 2>&1; then
  echo "WARN: No CSS bundle found under dist/assets/*.css (Tailwind build expected)." >&2
fi
echo "OK: Production index verified (no /src/main.tsx reference)."
