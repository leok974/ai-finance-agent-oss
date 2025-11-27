#!/usr/bin/env bash
set -euo pipefail

url="${1:-https://app.ledger-mind.org/?chat=diag}"
preset="${2:-app}"

# Ensure mcp-devdiag is installed
pip show mcp-devdiag >/dev/null 2>&1 || pip install -q "mcp-devdiag[playwright,export]==0.2.1"

# Run probe
mcp-devdiag probe --url "$url" --preset "$preset" --format json --export || true

# Show artifacts
echo ""
echo "Artifacts:"
ls -l artifacts/devdiag || true
