#!/usr/bin/env bash
set -euo pipefail

URL="${URL:-https://app.ledger-mind.org/version.json}"

echo ">>> Checking LedgerMind prod version at $URL"
REMOTE_JSON="$(curl -fsS "$URL")" || {
  echo "!! Failed to fetch version.json"
  exit 1
}

REMOTE_BRANCH="$(echo "$REMOTE_JSON" | jq -r '.branch // "unknown"')"
REMOTE_COMMIT="$(echo "$REMOTE_JSON" | jq -r '.commit // "unknown"')"

LOCAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
LOCAL_COMMIT="$(git rev-parse --short=8 HEAD)"

echo
echo "Remote: branch=$REMOTE_BRANCH commit=$REMOTE_COMMIT"
echo "Local : branch=$LOCAL_BRANCH commit=$LOCAL_COMMIT"
echo

if [[ "$REMOTE_BRANCH" == "$LOCAL_BRANCH" && "$REMOTE_COMMIT" == "$LOCAL_COMMIT" ]]; then
  echo "✅ Prod matches local HEAD. Safe to debug app behavior."
  exit 0
else
  echo "⚠️  Prod build is out of sync with local HEAD."
  echo "    Deploy nginx first: scripts/deploy-ledgermind-nginx.sh"
  exit 1
fi
