# HMAC Authentication for E2E Tests

## Quick Reference (Copilot)

```
Canonical: <METHOD>\n<PATH>\n<TIMESTAMP>\n<SHA256(body)>

Headers: X-Client-Id, X-Timestamp, X-Signature

Secrets: E2E_USER, E2E_SESSION_HMAC_SECRET (or HMAC_CLIENT_ID, HMAC_SECRET)

Paths: prefer AGENT_PATH env; prod is /agent/chat (nginx also exposes /api/agent/chat)

Auth Policy: stub/echo modes bypass HMAC; real modes require valid signature

Replay window: ±5 minutes clock skew; duplicate timestamp rejected (409 Conflict) via Redis

Metrics: agent_chat_requests_total, agent_chat_replay_attempts_total, agent_auth_skew_milliseconds

Redaction: Do not log secrets or canonical strings verbatim; X-Signature is redacted

Rotation: Rotate E2E_SESSION_HMAC_SECRET quarterly; use separate secrets per environment
```

## Production Authentication Policy

### Test Mode Bypass
**Test modes (`x-test-mode: stub|echo`) bypass HMAC authentication** for E2E testing:
- `stub`: Returns deterministic reply "This is a deterministic test reply."
- `echo`: Returns `[echo] <last-message-content>`
- Requires `ALLOW_TEST_STUBS=1` in production (safety gate)

### Real Mode Enforcement
**All other modes require valid HMAC-SHA256 signatures**:
- Missing headers → `401 Unauthorized`
- Invalid signature → `403 Forbidden`
- Timestamp outside ±5min window → `408 Request Timeout`
- Duplicate timestamp (replay) → `409 Conflict`

## Overview

Production `/agent/*` endpoints use HMAC-SHA256 authentication for security while allowing deterministic E2E testing.

## What the Backend Expects

### Headers
```
X-Client-Id: <your-client-id>
X-Timestamp: <unix-milliseconds>
X-Signature: <hmac-sha256-hex>
```

### Canonical String Format
```
<METHOD>\n<PATH>\n<TIMESTAMP>\n<BODY_SHA256>
```

**Components**:
- `METHOD`: Uppercased HTTP verb (e.g., `POST`)
- `PATH`: Path only, no domain/query (e.g., `/agent/chat`)
- `TIMESTAMP`: Same value used in `X-Timestamp` header
- `BODY_SHA256`: Lowercase hex SHA-256 of raw request body (empty string if no body)

### Replay Window
- **±5 minutes** clock skew allowed
- **Duplicate detection**: Same `client_id:timestamp` rejected with `409 Conflict`
- In-memory cache (300s TTL); use Redis for multi-worker deployments

### Response Codes
- `401`: Missing or invalid headers
- `403`: Signature mismatch
- `408`: Timestamp outside ±5 minute window
- `409`: Replay attack (duplicate timestamp from same client)

## Environment Configuration

### Credential Naming (Two Options)

The test utilities support **two naming conventions** for backward compatibility:

#### Option 1: Legacy E2E Naming (Recommended)
Already configured in `.env` for session minting:
```bash
E2E_USER=leoklemet.pa@gmail.com               # Client identifier
E2E_SESSION_HMAC_SECRET=***                   # Shared secret
BASE_URL=https://app.ledger-mind.org
PW_SKIP_WS=1                                  # Skip local dev server
```

#### Option 2: New HMAC Naming
Alternative if you prefer explicit HMAC variables:
```bash
HMAC_CLIENT_ID=prod-ui                        # Client identifier
HMAC_SECRET=***                               # Shared secret
AGENT_PATH=/agent/chat                        # Or /api/agent/chat
BASE_URL=https://app.ledger-mind.org
```

**Note**: `getHmacCredentials()` checks `HMAC_*` first, then falls back to `E2E_*` variables. This allows seamless integration with existing E2E infrastructure.

### Local Development
Create `apps/web/.env.test`:
```bash
# Use existing E2E credentials
E2E_USER=leoklemet.pa@gmail.com
E2E_SESSION_HMAC_SECRET=your-secret-here
AGENT_PATH=/agent/chat
BASE_URL=https://app.ledger-mind.org
PW_PROD_WORKERS=2
```

**Never commit `.env.test` with real secrets!**

### CI/CD Setup
Set as encrypted environment variables:
- `HMAC_CLIENT_ID`
- `HMAC_SECRET`

## Usage in Tests

### TypeScript (Playwright)

```typescript
import { signRequest, getHmacCredentials } from './utils/hmac';
import { getAgentChatUrl, AGENT_CHAT_PATH } from './utils/api';

test('agent/chat returns reply @prod-critical', async ({ request }) => {
  const { clientId, secret } = getHmacCredentials();

  const payload = {
    messages: [{ role: 'user', content: 'ping' }],
    context: { month: '2025-08' }
  };

  const { headers, body } = signRequest({
    method: 'POST',
    path: AGENT_CHAT_PATH,
    body: payload,
    clientId,
    secret,
  });

  const r = await request.post(getAgentChatUrl(BASE_URL), {
    headers: { ...headers, 'x-test-mode': 'stub' },
    data: JSON.parse(body),
  });

  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.reply).toMatch(/deterministic test reply/i);
});
```

### PowerShell (Quick Testing)

```powershell
$env:HMAC_CLIENT_ID = "prod-ui"
$env:HMAC_SECRET = "your-secret"

# Use the helper script
.\scripts\test-hmac-auth.ps1 -Payload '{"messages":[{"role":"user","content":"ping"}]}'
```

### Python (Smoke Tests)

```python
import os, time, hmac, hashlib, json, requests

BASE = os.getenv('BASE_URL', 'https://app.ledger-mind.org')
PATH = '/agent/chat'
CID  = os.getenv('HMAC_CLIENT_ID')
SEC  = os.getenv('HMAC_SECRET').encode()

body = {"messages":[{"role":"user","content":"ping"}], "context":{"month":"2025-08"}}
raw  = json.dumps(body, separators=(',',':'))
ts   = str(int(time.time()*1000))
bhex = hashlib.sha256(raw.encode()).hexdigest()
canon= f"POST\n{PATH}\n{ts}\n{bhex}"
sig  = hmac.new(SEC, canon.encode(), hashlib.sha256).hexdigest()

r = requests.post(f"{BASE}{PATH}",
  headers={
    "Content-Type":"application/json",
    "X-Client-Id":CID,
    "X-Timestamp":ts,
    "X-Signature":sig,
    "x-test-mode":"stub"
  },
  data=raw, timeout=15)

print(r.status_code, r.text)
```

## Troubleshooting

### Signature Mismatch (403)
- **Check**: Canonical string format matches exactly
- **Check**: Using same timestamp in header and canonical string
- **Check**: Body hash is lowercase hex
- **Check**: No extra whitespace in canonical string
- **Debug**: Print canonical string before signing

### Timestamp Skew (408/400)
- **Check**: System clock synchronized
- **Check**: Using milliseconds, not seconds
- **Fix**: `Date.now()` in TypeScript, `time.time()*1000` in Python

### Missing Credentials (401)
- **Check**: All three headers present (`X-Client-Id`, `X-Timestamp`, `X-Signature`)
- **Check**: Environment variables set correctly
- **Debug**: `console.log(process.env.HMAC_CLIENT_ID)`

### Test Mode Not Working
- **Check**: `x-test-mode: stub` header included
- **Check**: Backend has `ALLOW_TEST_STUBS=1` environment variable
- **Note**: Test modes only work in dev or when explicitly enabled

## Security Notes

### Secret Management
1. **Never commit secrets to git**
   - Use `.env.test` (add to `.gitignore`)
   - Use CI encrypted secrets for automation
   - Store in HashiCorp Vault or similar in production

2. **Rotate secrets quarterly**
   - Update `E2E_SESSION_HMAC_SECRET` in backend and CI
   - Test rotation in staging before production
   - Document rotation procedure in runbook

3. **Scope secrets per environment**
   - Consider separate keys: `E2E_SESSION_HMAC_SECRET_DEV`, `_STG`, `_PROD`
   - Prevents cross-environment replay attacks
   - Limits blast radius if key compromised

### Audit & Monitoring
1. **Redaction in logs**
   - `X-Signature` is automatically redacted by backend
   - Never log canonical strings (contains secret)
   - Log client_id, skew_ms, auth_mode for diagnostics

2. **Metrics tracked**
   - `agent_chat_requests_total{auth="ok|fail|bypass",mode}` - Request counter by auth result
   - `agent_chat_replay_attempts_total` - Duplicate timestamp attempts (replay attacks)
   - `agent_auth_skew_milliseconds` - Clock skew distribution histogram
   - Alert on sudden spikes in auth failures or replay attempts

3. **Production observability**
   - Monitor auth failure rate (baseline <1%)
   - Track skew_ms distribution (should be <1000ms)
   - Alert on replay attempts (potential attack)

### Nginx Header Pass-Through
Both `/agent/chat` and `/api/agent/chat` paths preserve HMAC headers:
```nginx
proxy_set_header X-Client-Id  $http_x_client_id;
proxy_set_header X-Timestamp  $http_x_timestamp;
proxy_set_header X-Signature  $http_x_signature;
```

### Replay Protection
- **Redis-backed cache** tracks `{client_id}:{timestamp}` for 5 minutes (multi-worker safe)
- Duplicate requests rejected with `409 Conflict`
- Fallback to in-memory cache if Redis unavailable (development mode)
- Configuration:
  - `REDIS_URL`: Redis connection string (default: `redis://localhost:6379/0`)
  - `REDIS_REPLAY_PREFIX`: Key prefix (default: `hmac:replay:`)
  - `REDIS_REPLAY_TTL`: TTL in seconds (default: `300`)

### CI/CD Integration
Pre-E2E smoke test:
```yaml
- name: HMAC Smoke Test
  run: |
    export E2E_USER="${{ secrets.E2E_USER }}"
    export E2E_SESSION_HMAC_SECRET="${{ secrets.E2E_SESSION_HMAC_SECRET }}"
    ./scripts/smoke-hmac.sh
```

Prod E2E suite:
```yaml
- name: E2E Tests
  env:
    PW_SKIP_WS: '1'
    E2E_USER: ${{ secrets.E2E_USER }}
    E2E_SESSION_HMAC_SECRET: ${{ secrets.E2E_SESSION_HMAC_SECRET }}
  run: |
    cd apps/web
    pnpm exec playwright test -g "@prod-critical" --workers=2
```

3. **Limit client permissions**
   - Use separate credentials for E2E vs. production
   - Monitor for unusual patterns

4. **Replay protection**
   - 5-minute window limits replay attacks
   - Signature prevents tampering

## API Path Compatibility

Both paths work (nginx rewrites):
- `/agent/chat` (preferred, modern)
- `/api/agent/chat` (legacy, compatibility)

Set via `AGENT_PATH` environment variable.

## References

- HMAC utilities: `apps/web/tests/e2e/utils/hmac.ts`
- API paths: `apps/web/tests/e2e/utils/api.ts`
- Example tests: `apps/web/tests/e2e/chat-basic.spec.ts`
- Backend implementation: `apps/backend/app/middleware/hmac_auth.py` (check your actual path)
