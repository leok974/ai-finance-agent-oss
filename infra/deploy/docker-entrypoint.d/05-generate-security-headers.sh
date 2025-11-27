#!/bin/sh
# Generate security-headers.conf at runtime with CSP hash
set -eu

RUNTIME_DIR="/var/run/nginx-runtime/conf.d"
SECURITY_HEADERS="$RUNTIME_DIR/security-headers.conf"

# Create runtime directory if it doesn't exist
mkdir -p "$RUNTIME_DIR"

# Generate security-headers.conf
# Note: CSP hashes would be computed from actual assets in production
# For now, use a basic CSP that allows inline scripts with unsafe-inline as fallback
cat > "$SECURITY_HEADERS" << 'EOF'
# Content Security Policy
# Generated at container startup
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.ledger-mind.org https://app.ledger-mind.org; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; report-uri /api/csp-report; report-to csp" always;
EOF

echo "[security-headers] Generated $SECURITY_HEADERS"
exit 0
