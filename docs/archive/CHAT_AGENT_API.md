# Chat Agent API Architecture

## Overview

The LedgerMind chat panel (`ChatDock.tsx`) communicates with the FastAPI backend via RESTful endpoints and Server-Sent Events (SSE) streams. All requests require authentication except in dev mode with `DEV_ALLOW_NO_AUTH=1`. Encryption can be enabled via Google Cloud KMS or disabled for local development.

**Key Endpoints:**
- `/agent/chat` (POST) - Conversational agent with tool orchestration
- `/agent/stream` (GET SSE) - Streaming responses with tool execution updates
- `/agent/tools/*` (POST) - Direct tool invocations (charts, insights, budget, etc.)
- `/auth/me` (GET) - Current user identity and roles

**Backend Stack:**
- **FastAPI** (Python 3.11+) with Uvicorn ASGI server
- **PostgreSQL** with pgvector extension for RAG embeddings
- **Redis** for caching and session state
- **Ollama** for local LLM inference (fallback to OpenAI API)

---

## Chat API Endpoints

### POST `/agent/chat`

Conversational agent endpoint with tool orchestration and LLM routing.

**Request Schema:**
```python
class AgentChatRequest(BaseModel):
    messages: List[Dict[str, str]]  # [{ role: "user"|"assistant", content: str }]
    intent: str = "general"          # Intent hint: "general"|"explain_txn"|"budget_help"|"rule_seed"
    context: Optional[Dict] = None   # Financial context (month, txn IDs, etc.)
    conversational: bool = True      # Enable friendly voice styling
```

**Response Schema:**
```python
class AgentChatResponse(BaseModel):
    reply: str                       # Assistant message text
    citations: List[Dict]            # Data sources used [{ type: str, count: int }]
    used_context: Dict               # Context applied { month: str }
    tool_trace: List[str]            # Tools executed ["charts.summary", "insights.expanded"]
    model: str                       # LLM model used "gpt-oss:20b"
    mode: Optional[str]              # Response mode: "primary"|"finance_quick_recap"|"analytics.forecast"
    args: Optional[Dict]             # Mode arguments
    suggestions: List[Dict]          # Follow-up chips [{ label: str, action: str, source: "gateway"|"model" }]
    rephrased: Optional[bool]        # Whether LLM rephrased tool output
    _router_fallback_active: bool    # True if deterministic fallback was used (LLM unavailable)
    explain: Optional[str]           # RAG explanation (for "Why?" button)
    sources: Optional[List]          # RAG source documents
```

**Example Request:**
```bash
curl http://127.0.0.1:8000/agent/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=..." \
  -d '{
    "messages": [{"role": "user", "content": "Summarize my spending this month"}],
    "intent": "general",
    "context": null,
    "conversational": true
  }'
```

**Example Response:**
```json
{
  "reply": "Here's your spending summary for November 2025:\n\n- **Total Spend:** $3,245\n- **Top Category:** Dining out ($890)\n- **Biggest Spike:** $450 at Best Buy on Nov 12\n\nOne recommendation: Consider setting a $700 budget for dining to stay on track.",
  "citations": [
    {"type": "transactions", "count": 124},
    {"type": "month_summary", "count": 1}
  ],
  "used_context": {"month": "2025-11"},
  "tool_trace": ["charts.summary", "charts.merchants"],
  "model": "gpt-oss:20b",
  "mode": "primary",
  "suggestions": [
    {"label": "Show deeper breakdown", "action": "deeper_breakdown", "source": "gateway"},
    {"label": "Budget check", "action": "budget_check", "source": "gateway"}
  ],
  "rephrased": true,
  "_router_fallback_active": false
}
```

---

### GET `/agent/stream` (SSE)

Server-Sent Events stream for AGUI (Agent Gateway Unified Interface) mode. Returns real-time tool execution updates and streamed LLM response chunks.

**Query Parameters:**
- `q` (required): User query string
- `month` (optional): Month context (e.g., "2025-11")
- `mode` (optional): Force routing branch ("overview", "budget", "subscriptions", "what-if", etc.)

**Event Types:**
```
event: start
data: {"meta": {"intent": "overview", "session_id": "abc123"}}

event: intent
data: {"intent": "overview"}

event: tool_start
data: {"name": "charts.summary"}

event: chunk
data: {"text": "Here's your "}

event: chunk
data: {"text": "spending summary..."}

event: tool_end
data: {"name": "charts.summary", "ok": true}

event: suggestions
data: {"chips": [{"label": "Deeper breakdown", "action": "deeper_breakdown"}]}

event: finish
data: {}
```

**Example Usage (JavaScript):**
```javascript
const es = new EventSource('/agent/stream?q=Show%20my%20spending&month=2025-11');
let reply = '';

es.addEventListener('chunk', (e) => {
  const data = JSON.parse(e.data);
  reply += data.text;
});

es.addEventListener('suggestions', (e) => {
  const data = JSON.parse(e.data);
  console.log('Follow-ups:', data.chips);
});

es.addEventListener('finish', () => {
  es.close();
  console.log('Final reply:', reply);
});
```

---

## Streaming & Planner UI

### `/agent/stream` Endpoint (NDJSON)

**Protocol**: Newline-Delimited JSON (NDJSON) over HTTP streaming
**Media Type**: `application/x-ndjson`
**Purpose**: Real-time chat responses with tool execution visibility

**Event Types**:
- `start` – Session initialization
- `planner` – Shows detected intent and tools to be executed
- `tool_start` / `tool_end` – Tool execution lifecycle
- `token` – LLM response text chunks (streamed character-by-character or word-by-word)
- `done` – Stream completion
- `error` – Error occurred (with message details)

**Frontend Integration** (`useAgentStream.ts`):
- Custom React hook manages NDJSON parsing with buffer handling for concatenated events
- Displays "Thinking…" bubble with animated tool chips during `planner` phase
- Progressive text rendering as `token` events arrive
- Fallback parser handles both proper NDJSON (real newlines) and escaped `\n` sequences

**LLM Provider Strategy**:
- **Local-first**: Ollama (local inference, no API costs)
- **Fallback**: OpenAI API (when Ollama unavailable or warming up)
- **Automatic**: Backend switches providers transparently during stream

**Testing**:
- E2E tests verify streaming works end-to-end: `apps/web/tests/e2e/chat-streaming-consistency.spec.ts`
- Tests run against production (`https://app.ledger-mind.org`) with demo auth
- Assertions check for assistant responses within 30s timeout
- Validates both user queries and tool-based interactions

**Why This Matters** (for recruiters/hiring managers):
- **UX**: Users see progress in real-time instead of waiting for complete response
- **Transparency**: Tool execution visible (users know what data is being accessed)
- **Reliability**: Multi-provider fallback ensures high availability
- **Testability**: E2E tests prevent regressions in production streaming behavior

---

### POST `/agent/tools/charts/summary`

Get month financial summary (income, spend, net) without LLM rephrase.

**Request:**
```json
{
  "month": "2025-11",
  "include_daily": false
}
```

**Response:**
```json
{
  "month": "2025-11",
  "income": 5200.50,
  "spend": -3245.75,
  "net": 1954.75,
  "daily": []
}
```

---

### POST `/agent/tools/charts/merchants`

Get top merchants by spending volume for a month.

**Request:**
```json
{
  "month": "2025-11",
  "limit": 10
}
```

**Response:**
```json
{
  "month": "2025-11",
  "merchants": [
    {"merchant": "Safeway", "amount": -890.45, "count": 12},
    {"merchant": "Shell", "amount": -420.30, "count": 8}
  ]
}
```

---

### POST `/agent/tools/insights/expanded`

Get expanded insights with month-over-month comparison and anomaly detection.

**Request:**
```json
{
  "month": "2025-11",
  "large_limit": 10
}
```

**Response:**
```json
{
  "month": "2025-11",
  "summary": {
    "income": 5200.50,
    "spend": -3245.75,
    "net": 1954.75
  },
  "mom_change": {
    "income_pct": 2.5,
    "spend_pct": -8.2,
    "net_pct": 15.3
  },
  "anomalies": [
    {"merchant": "Best Buy", "amount": -450.00, "date": "2025-11-12", "reason": "spike"}
  ],
  "unknown_spend": {
    "amount": -125.00,
    "count": 3
  }
}
```

---

## Auth & User Identity

### Agent Auth Modes

Agent endpoints (`/agent/chat`, `/agent/rephrase`, and tool runners) share a common auth dependency `verify_hmac_auth` with the following priority:

1. **Test modes** – `X-Test-Mode: stub|echo` (used in E2E tests + staging environments)
2. **HMAC** – `X-Client-Id`, `X-Timestamp`, `X-Signature` headers (E2E tests, service-to-service)
3. **Cookie fallback** – `access_token` session cookie (normal user sessions from frontend)
4. Otherwise → `401 Authentication required`

**Frontend Behavior:**
- LedgerMind web app uses cookie auth (`access_token`, `refresh_token`, `csrf_token`)
- All requests include `credentials: 'include'` to send cookies

**E2E Test Behavior:**
- Tests use HMAC authentication with signed headers
- See `E2E_HMAC_AUTH.md` for HMAC signature details

**Priority:**
- When both HMAC headers and cookies are present, **HMAC wins**
- This ensures E2E tests continue working even with valid session cookies

**Auth Mode Header:**
- Backend may return `X-Auth-Mode: hmac|cookie|bypass` header for debugging
- Use browser Network tab to verify which auth path was used

### GET `/auth/me`

Returns current authenticated user with roles and dev unlock status.

**No Request Body** (cookies or bearer token provide auth)

**Response:**
```json
{
  "email": "user@example.com",
  "roles": ["user", "admin"],
  "is_active": true,
  "dev_unlocked": false,
  "unlock_persist": null,
  "env": "prod"
}
```

**Dev Bypass Mode (`DEV_ALLOW_NO_AUTH=1`):**

When enabled, the backend auto-creates and returns a `dev@local` user with admin roles **only if some credentials are present** (cookie or bearer token). This preserves negative auth test behavior (endpoints that test auth failure still return 401 when NO credentials are sent).

**Auth Bypass Logic (`apps/backend/app/utils/auth.py` lines 323-350):**
```python
def get_current_user(request, creds, db):
    _raw_bypass = os.getenv("DEV_ALLOW_NO_AUTH", "0")
    if _raw_bypass in ("1", "true", "True"):
        # Special-case: endpoints testing auth failure need 401 when NO creds
        missing_all_creds = (not creds) and (not request.cookies.get("access_token"))
        if (not path.startswith("/auth/status")
            and not path.startswith("/protected")
            and not missing_all_creds):
            # Create/return dev user only when some auth context exists
            u = db.query(User).filter(User.email == "dev@local").first()
            if not u:
                u = User(email="dev@local", password_hash=hash_password("dev"))
                db.add(u)
                db.commit()
                db.refresh(u)
                _ensure_roles(db, u, ["user", "admin", "analyst"])
            return u

    # Normal auth flow: decode JWT from bearer/cookie
    token = creds.credentials if creds else request.cookies.get("access_token")
    if not token:
        raise HTTPException(401, "Missing credentials")
    # ... decode token, fetch user from DB ...
```

**Why curl tests fail without credentials:**
```bash
# ❌ Fails: no credentials sent → missing_all_creds=True → bypass skipped
curl http://127.0.0.1:8000/auth/me

# ✅ Works: dummy cookie sent → missing_all_creds=False → bypass activates
curl http://127.0.0.1:8000/auth/me -H "Cookie: access_token=dummy"
```

**Browser requests work automatically** because they send cookies from prior auth flows.

---

## Crypto / Encryption Flags

### Production Encryption (GCP KMS)

**Environment Variables (docker-compose.prod.yml):**
```yaml
environment:
  ENCRYPTION_ENABLED: "1"
  GCP_KMS_KEY: "projects/ledgermind-03445-3l/locations/us-east1/keyRings/ledgermind/cryptoKeys/kek"
  GCP_KMS_AAD: "app=ledgermind,env=prod"
  GOOGLE_APPLICATION_CREDENTIALS: /secrets/gcp-sa.json

volumes:
  - ./secrets/gcp-sa.json/ledgermind-backend-sa.json:/secrets/gcp-sa.json:ro
```

**Startup Behavior:**
- Backend attempts to load DEK (Data Encryption Key) from GCP KMS on startup
- If `CRYPTO_STRICT_STARTUP=1` (default 0), failure to load key is **fatal** (exits with error)
- If `CRYPTO_STRICT_STARTUP=0`, failure downgrades to **warning** (app starts without encryption)
- Encrypted fields in DB (e.g., transaction memos) are stored as base64-encoded ciphertext

**Startup Logs (success):**
```
INFO:     crypto: enabled (GCP KMS)
INFO:     crypto debug: key=projects/.../kek, aad=app=ledgermind,env=prod, sa=ledgermind-backend@...
```

**Startup Logs (failure, non-strict):**
```
ERROR:    crypto init failed: 400 Decryption failed.
WARNING:  crypto: disabled (ENCRYPTION_ENABLED!=1 or init failed)
```

### Development Encryption Disabled

**Environment Variables (docker-compose.dev.yml):**
```yaml
environment:
  ENCRYPTION_ENABLED: "0"
  # GCP_KMS_KEY: (commented out)
  # GOOGLE_APPLICATION_CREDENTIALS: (commented out)
```

**Startup Logs:**
```
INFO:     crypto: disabled (ENCRYPTION_ENABLED!=1)
```

**Why disable in dev:**
1. Avoid dependency on GCP service account credentials
2. Faster startup (no KMS network calls)
3. Easier debugging (plaintext DB fields)

---

## Error Handling & Typical Failures

### 1. **Missing Credentials (401)**

**Symptom:**
```json
{"detail": "Missing credentials"}
```

**Cause:** No bearer token or `access_token` cookie sent in request.

**Fix:**
- Ensure frontend includes `credentials: 'same-origin'` in fetch options
- Check browser cookies for `access_token` (set by `/auth/login`)
- In dev mode, verify `DEV_ALLOW_NO_AUTH=1` and send dummy cookie:
  ```bash
  curl -H "Cookie: access_token=dummy" http://127.0.0.1:8000/auth/me
  ```

---

### 2. **Internal Server Error (500)**

**Symptom:**
```json
{"detail": "Internal server error"}
```

**Cause:** Unhandled exception in backend (database connection, LLM timeout, encryption error, etc.).

**Debugging:**
```bash
# Check backend logs for traceback
docker logs ai-finance-agent-oss-clean-backend-1 --tail 100 | grep -A 20 "Traceback"

# Or follow logs in real-time
docker logs -f ai-finance-agent-oss-clean-backend-1
```

**Common causes:**
- Database pool exhaustion (increase `DB_POOL_SIZE` / `DB_MAX_OVERFLOW`)
- LLM timeout (increase `LLM_READ_TIMEOUT`)
- Encryption key unavailable (check GCP KMS connectivity or disable encryption)

---

### 3. **LLM Fallback Active**

**Symptom:** Response includes `_router_fallback_active: true` and toast notification appears.

**Cause:** Ollama/OpenAI LLM is warming up, unavailable, or timed out. Backend falls back to deterministic response templates.

**Frontend Handling:**
```typescript
if (response._router_fallback_active === true) {
  toast({
    title: "Using deterministic fallback",
    description: "The model is warming up or unavailable.",
    variant: "default",
  });
}
```

**Backend Logs:**
```
WARNING:  LLM timeout, using fallback template
INFO:     [agent] fallback mode active for intent=overview
```

---

### 4. **Tool Execution Skipped**

**Symptom:** AGUI stream emits `tool_end` with `ok=false`, final reply includes:
```
⚠️ Skipped: charts.merchants, analytics.kpis (unavailable). I used everything else.
```

**Cause:** Tool endpoint returned 500/503 (database unavailable, data missing, etc.).

**Fix:** Check backend logs for specific tool errors. Common issues:
- Month has no data (empty transactions table)
- Budget module not configured
- ML model not loaded

---

### 5. **CORS Errors in Dev**

**Symptom:** Browser console shows:
```
Access to fetch at 'http://127.0.0.1:8000/agent/chat' from origin 'http://127.0.0.1:5173' has been blocked by CORS policy
```

**Cause:** Backend not configured to allow dev server origin.

**Fix:** Add to `docker-compose.dev.yml`:
```yaml
environment:
  CORS_ALLOW_ORIGINS: "http://127.0.0.1:5173,http://localhost:5173"
  FRONTEND_ORIGIN: "http://127.0.0.1:5173"
```

---

## How the Web Client Calls These Endpoints

### Unified Fetch Helper (`apps/web/src/lib/http.ts`)

**All API calls use `fetchJSON(path, options)` helper** to ensure consistent headers, error handling, and credential passing.

```typescript
export async function fetchJSON(
  path: string,
  opts?: {
    method?: string;
    body?: any;
    query?: Record<string, any>;
    signal?: AbortSignal;
  }
) {
  const url = new URL(path, VITE_API_BASE || '/');
  if (opts?.query) {
    Object.entries(opts.query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const res = await fetch(url.toString(), {
    method: opts?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...opts?.headers,
    },
    credentials: 'same-origin', // Send cookies
    cache: 'no-store',          // Prevent stale data
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    signal: opts?.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}
```

**Usage Examples:**
```typescript
// GET /auth/me
const user = await fetchJSON('/auth/me');

// POST /agent/chat
const response = await fetchJSON('/agent/chat', {
  method: 'POST',
  body: {
    messages: [{ role: 'user', content: 'Show spending' }],
    intent: 'general',
    conversational: true,
  },
});

// POST /agent/tools/charts/summary with month query param
const summary = await fetchJSON('/agent/tools/charts/summary', {
  method: 'POST',
  body: { month: '2025-11' },
});
```

### AGUI Streaming (`apps/web/src/lib/aguiStream.ts`)

**Server-Sent Events client for `/agent/stream`:**

```typescript
export function wireAguiStream(
  { q, month, mode }: { q: string; month?: string; mode?: string },
  callbacks: {
    onStart: (meta: any) => void;
    onIntent: (intent: string) => void;
    onToolStart: (name: string) => void;
    onToolEnd: (name: string, ok: boolean) => void;
    onChunk: (text: string) => void;
    onSuggestions: (chips: any[]) => void;
    onFinish: () => void;
    onError: () => void;
  }
) {
  const params = new URLSearchParams({ q });
  if (month) params.set('month', month);
  if (mode) params.set('mode', mode);

  const es = new EventSource(`/agent/stream?${params}`);

  es.addEventListener('start', (e) => callbacks.onStart(JSON.parse(e.data)));
  es.addEventListener('intent', (e) => callbacks.onIntent(JSON.parse(e.data).intent));
  es.addEventListener('tool_start', (e) => callbacks.onToolStart(JSON.parse(e.data).name));
  es.addEventListener('tool_end', (e) => {
    const { name, ok } = JSON.parse(e.data);
    callbacks.onToolEnd(name, ok);
  });
  es.addEventListener('chunk', (e) => callbacks.onChunk(JSON.parse(e.data).text));
  es.addEventListener('suggestions', (e) => callbacks.onSuggestions(JSON.parse(e.data).chips));
  es.addEventListener('finish', () => {
    es.close();
    callbacks.onFinish();
  });
  es.addEventListener('error', () => {
    es.close();
    callbacks.onError();
  });
}
```

---

## API Path Conventions

**NO `/api` prefix for non-auth endpoints:**
- ✅ `fetchJSON('/auth/me')`
- ✅ `fetchJSON('/agent/chat')`
- ✅ `fetchJSON('/agent/tools/charts/summary')`
- ❌ `fetchJSON('/api/auth/me')` (only Google OAuth uses `/api/auth/*`)

**Google OAuth endpoints (legacy `/api` prefix):**
- `/api/auth/google/login`
- `/api/auth/google/callback`
- `/api/auth/google/logout`

**Relative paths in dev (Vite proxy):**
```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8000',
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
    '/agent': {
      target: 'http://127.0.0.1:8000',
    },
    '/auth': {
      target: 'http://127.0.0.1:8000',
    },
  },
}
```

---

## References

- **Chat endpoint**: `apps/backend/app/routers/agent.py`
- **Auth bypass logic**: `apps/backend/app/utils/auth.py` (lines 320-400)
- **HTTP helper**: `apps/web/src/lib/http.ts`
- **AGUI stream client**: `apps/web/src/lib/aguiStream.ts`
- **Docker compose dev**: `docker-compose.dev.yml`
- **Docker compose prod**: `docker-compose.prod.yml`
