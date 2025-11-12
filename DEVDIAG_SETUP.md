# DevDiag Setup Guide for LedgerMind

Complete setup instructions for mcp-devdiag integration with LedgerMind.

## Prerequisites

- mcp-devdiag service running (see `deploy/devdiag.yaml`)
- PostgreSQL database for learning loop
- Admin access to GitHub repository secrets
- AWS credentials for S3 export (optional)

## 1. Database Setup

Create the DevDiag database and user:

```sql
-- Connect to PostgreSQL as superuser
CREATE USER devdiag WITH PASSWORD 'DevDiag2025SecurePass!';
CREATE DATABASE devdiag OWNER devdiag;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE devdiag TO devdiag;
```

## 2. GitHub Secrets Configuration

Go to **Settings → Secrets and variables → Actions** and add:

### Required Secrets

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `DEVDIAG_BASE` | DevDiag service base URL | `https://devdiag.yourdomain.com` |
| `DEVDIAG_READER_JWT` | Read-only JWT token for quickcheck | `eyJhbGciOiJIUzI1Ni...` |
| `DEVDIAG_OPERATOR_JWT` | Full-access JWT token for remediation writes | `eyJhbGciOiJIUzI1Ni...` |
| `LM_PREVIEW_URL` | Preview URL for PR checks | `https://pr-{PR_NUMBER}.ledger-mind.org` |
| `LM_CANARY_URL` | Production health endpoint | `https://app.ledger-mind.org/healthz` |
| `LM_EMBED_TEST_URL` | Embed test page (optional) | `https://app.ledger-mind.org/embed/test` |

### JWT Token Generation

Generate JWT tokens with appropriate claims:

```json
{
  "aud": "mcp-devdiag",
  "sub": "ledgermind-ci",
  "iat": 1699564800,
  "exp": 1731100800,
  "scope": "read:quickcheck"
}
```

For operator token, use scope: `write:remediation read:quickcheck`

## 3. Backend Environment Variables

Add to `.env` or container environment:

```bash
# DevDiag Service
DEVDIAG_BASE=http://localhost:8023
DEVDIAG_JWT=  # Leave empty for local dev

# For production backend
DEVDIAG_BASE=https://devdiag.yourdomain.com
DEVDIAG_JWT=your-service-jwt-token-here
```

## 4. Install Backend Dependencies

```bash
cd apps/backend
pip install "mcp-devdiag[playwright,export]==0.2.1"
# Or if using venv:
.venv/Scripts/python.exe -m pip install "mcp-devdiag[playwright,export]==0.2.1"
```

## 5. Local Smoke Test (PowerShell)

Test the DevDiag integration locally:

```powershell
# Set environment variables
$env:DEVDIAG_BASE = "http://localhost:8023"
$env:TARGET = "https://app.ledger-mind.org"

# Test quickcheck endpoint
Invoke-WebRequest -UseBasicParsing -Method Post "$env:DEVDIAG_BASE/mcp/diag/quickcheck" `
  -ContentType "application/json" `
  -Body "{`"url`":`"$env:TARGET`",`"preset`":`"app`",`"tenant`":`"ledgermind`"}" |
  Select-Object -Expand Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Test via backend ops endpoint (requires admin JWT)
$adminToken = "your-admin-jwt"
Invoke-WebRequest -UseBasicParsing -Method Post "http://localhost:8000/ops/diag?target_url=$env:TARGET&preset=app" `
  -Headers @{Authorization = "Bearer $adminToken"} |
  Select-Object -Expand Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

## 6. Learning Loop - Write Remediation

Record a successful fix in the learning database:

```bash
curl -sS -X POST "$DEVDIAG_BASE/mcp/diag/remediation" \
  -H "Authorization: Bearer $DEVDIAG_OPERATOR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "ledgermind",
    "problem_code": "CSP_INLINE_BLOCKED",
    "fix_code": "FIX_CSP_NONCE",
    "confidence": 0.9,
    "context": {
      "file": "apps/web/src/boot/mountChat.tsx",
      "commit": "96786223",
      "pr": 185
    }
  }' | jq .
```

## 7. Playwright Driver Setup (Optional)

For DOM and console harvesting, ensure Playwright browsers are installed:

```bash
# In DevDiag service environment
playwright install chromium
playwright install-deps
```

Update `deploy/devdiag.yaml`:

```yaml
diag:
  driver: "playwright"  # Enables DOM/console capture
```

## 8. Verification Checklist

- [ ] Database `devdiag` created with correct user
- [ ] All GitHub secrets configured
- [ ] Backend `mcp-devdiag` installed
- [ ] Local smoke test passes
- [ ] `/ops/diag` endpoint returns 200 (admin user)
- [ ] PR quickcheck workflow enabled
- [ ] Canary workflow scheduled (hourly at :12)

## 9. Footgun Guards

### Timeouts

- **Total:** 20s (prevents CI hangs)
- **Connect:** 5s (fail fast on network issues)

### SSRF Protection

Only allowlisted hosts in `devdiag.yaml` are accessible. Add new hosts carefully:

```yaml
runtime:
  security:
    ssrf_allow_hosts:
      - "your-new-host.com"
```

### Redirect Limits

Maximum 5 redirects to prevent infinite loops. OAuth flows should complete within this limit.

### User-Agent

DevDiag sets `DevDiag/0.2.1 (+ledgermind)` - ensure WAF rules allow it.

## 10. Troubleshooting

### "Connection refused" from backend

- Check `DEVDIAG_BASE` environment variable
- Ensure DevDiag service is running: `docker ps | grep devdiag`
- Test direct connection: `curl $DEVDIAG_BASE/health`

### "403 Forbidden" from ops endpoint

- Ensure user has `admin` role in database
- Check JWT token is valid and not expired
- Verify `require_admin` dependency works

### "SSRF blocked" errors

- Add target host to `ssrf_allow_hosts` in `devdiag.yaml`
- Restart DevDiag service to reload config

### Learning loop not recording

- Check PostgreSQL connection string in `devdiag.yaml`
- Verify `devdiag` user has write permissions
- Check `DEVDIAG_OPERATOR_JWT` has `write:remediation` scope

## 11. Next Steps

1. **Run first canary manually**: `gh workflow run devdiag-canary.yml`
2. **Test PR workflow**: Open a test PR that modifies `apps/web/`
3. **Review learning database**: Query `SELECT * FROM remediations;`
4. **Set up alerting**: Configure Slack/PagerDuty for canary failures

## 12. Links

- [mcp-devdiag Documentation](https://github.com/yourusername/mcp-devdiag)
- [LedgerMind DevDiag Config](./deploy/devdiag.yaml)
- [Backend Ops Router](./apps/backend/app/routers/ops_diag.py)
- [DevDiag Client](./apps/backend/diag/devdiag_client.py)

---

**Last Updated:** 2025-01-10
**Owner:** Platform Team (@leok974)
