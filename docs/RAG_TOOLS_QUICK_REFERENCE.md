# RAG Tools Quick Reference

## Admin Checklist (PowerShell)

### Local Development Setup
```powershell
# 1. Enable dev-gated actions
$env:ALLOW_DEV_ROUTES='1'

# 2. Start backend
cd apps/backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# 3. Get auth cookies (use browser dev tools or login endpoint)
# Store session cookies for authenticated requests
```

### Quick API Pings
```powershell
# Set your auth token
$token = "your-csrf-token-here"
$cookies = "access_token=your-token; refresh_token=your-refresh"

# Status check
curl -s -X GET http://127.0.0.1:8000/agent/tools/rag/status `
  -H "Cookie: $cookies" `
  -H "X-CSRF-Token: $token" | jq

# Rebuild index (⚠️ DANGEROUS - deletes all data)
curl -s -X POST http://127.0.0.1:8000/agent/tools/rag/rag.rebuild `
  -H "Cookie: $cookies" `
  -H "X-CSRF-Token: $token" `
  -H "Content-Type: application/json" `
  -d '{}' | jq

# Seed starter data (dev-only)
curl -s -X POST http://127.0.0.1:8000/agent/tools/rag/rag.seed `
  -H "Cookie: $cookies" `
  -H "X-CSRF-Token: $token" `
  -d '{}' | jq

# Ingest URL
curl -s -X POST http://127.0.0.1:8000/agent/tools/rag/ingest_url `
  -H "Cookie: $cookies" `
  -H "X-CSRF-Token: $token" `
  -d "url=https://www.dropbox.com/plans" | jq

# Ingest PDF
curl -s -X POST http://127.0.0.1:8000/agent/tools/rag/ingest_pdf `
  -H "Cookie: $cookies" `
  -H "X-CSRF-Token: $token" `
  -F "file=@pricing-guide.pdf" `
  -F "vendor=TestVendor" | jq
```

## Natural Language Commands

### Via ChatDock or Agent Endpoint
```
"What's the RAG status?"
"Show me knowledge base stats"
"Get RAG index info"

"Rebuild the knowledge index"
"Clear the RAG database"
"Reindex everything"

"Seed the RAG dataset"           # Dev-only
"Bootstrap knowledge base"       # Dev-only

"Ingest https://slack.com/pricing"
"Add this URL to RAG: https://zoom.us/pricing"
"Index https://www.atlassian.com/software/jira/pricing"
```

## Testing Commands

### Backend Tests
```powershell
# All RAG tests
pytest apps/backend/tests/test_agent_rag_tools.py -v

# Specific test class
pytest apps/backend/tests/test_agent_rag_tools.py::TestRagToolsAuth -v

# With coverage
pytest apps/backend/tests/test_agent_rag_tools.py --cov=app.services.rag_tools --cov-report=html
```

### E2E Tests
```powershell
# All RAG E2E tests
pnpm -C apps/web run test:fast:auto --grep "RAG Tools"

# Backend API tests only
pnpm -C apps/web exec playwright test tests/e2e/rag-tools.spec.ts --grep "@backend"

# Integration tests only
pnpm -C apps/web exec playwright test tests/e2e/rag-tools.spec.ts --grep "@integration"

# Debug mode
pnpm -C apps/web exec playwright test tests/e2e/rag-tools.spec.ts --debug
```

## Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 401 | Not authenticated | Login first |
| 403 | Not admin or dev route disabled | Ensure user has admin role, set `ALLOW_DEV_ROUTES=1` for seed |
| 400 | Invalid input | Check URL format, file type |
| 500 | Backend error | Check logs, network connectivity |

## Database Schema (RAG Tables)

### `rag_documents`
```sql
CREATE TABLE rag_documents (
    id INTEGER PRIMARY KEY,
    source TEXT,           -- 'url' or 'file'
    url TEXT,              -- URL if source=url
    title TEXT,            -- Document title
    vendor TEXT,           -- Vendor name (e.g., 'Spotify')
    etag TEXT,             -- HTTP ETag for change detection
    last_modified TEXT,    -- HTTP Last-Modified header
    content_hash TEXT,     -- SHA256 of text content
    status TEXT            -- 'ok', 'error', etc.
);
```

### `rag_chunks`
```sql
CREATE TABLE rag_chunks (
    id INTEGER PRIMARY KEY,
    doc_id INTEGER,        -- Foreign key to rag_documents
    chunk_idx INTEGER,     -- Order within document
    content TEXT,          -- Text chunk (~500 tokens)
    meta_json TEXT,        -- JSON metadata
    embedding BLOB,        -- Embeddings bytes (fallback)
    embedding_vec VECTOR   -- pgvector column (Postgres only)
);
```

## Monitoring & Observability

### Check Index Health
```bash
# Get status
curl http://127.0.0.1:8000/agent/tools/rag/status | jq

# Expected output:
# {
#   "status": "ok",
#   "documents": 42,
#   "chunks": 387,
#   "vendors": ["Spotify", "Netflix", "Slack"]
# }
```

### Log Analysis
```bash
# Backend logs (uvicorn)
tail -f apps/backend/logs/app.log | grep -i "rag"

# Check for errors
grep -i "rag.*error" apps/backend/logs/app.log
```

## Security Checklist

- [ ] All RAG endpoints require authentication
- [ ] Admin role verified for all actions
- [ ] Dev-only gate active for `rag.seed` in production
- [ ] CSRF tokens validated on unsafe methods
- [ ] File uploads validated (PDF only, size limits)
- [ ] URL validation prevents SSRF attacks
- [ ] Rate limiting considered for production

## Performance Tips

### Ingest Optimization
- Batch URLs via `rag.bulk_ingest` instead of individual calls
- Use `force=False` to skip unchanged URLs (ETag checking)
- Monitor chunk count growth over time

### Query Optimization (Future)
- Add pgvector indexes for fast semantic search
- Implement caching layer for frequent queries
- Consider vector search vs. full-text search tradeoffs

## Troubleshooting

### Issue: "Admin only" error
**Solution:** Ensure user has admin role assigned in database.
```sql
-- Check roles
SELECT u.email, r.name
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id;

-- Add admin role
INSERT INTO user_roles (user_id, role_id)
VALUES (
    (SELECT id FROM users WHERE email='admin@example.com'),
    (SELECT id FROM roles WHERE name='admin')
);
```

### Issue: "Dev route disabled" for rag.seed
**Solution:** Set environment variable.
```powershell
$env:ALLOW_DEV_ROUTES='1'
# or
$env:APP_ENV='dev'
```

### Issue: PDF ingest fails with "Empty file"
**Solution:** Ensure PDF is valid and not corrupted.
```bash
# Verify PDF
file pricing.pdf
# Output should say: PDF document, version X.X
```

### Issue: URL ingest times out
**Solution:** Check network connectivity and URL accessibility.
```bash
# Test URL manually
curl -I https://example.com/pricing
# Should return 200 OK
```

## Quick Integration Snippets

### Add RagToolChips to ChatDock
```tsx
// apps/web/src/components/ChatDock.tsx
import { RagToolChips } from './RagToolChips';
import { useIsAdmin } from '@/state/auth';

export default function ChatDock() {
  const isAdmin = useIsAdmin();

  return (
    <div>
      {/* Existing chat UI */}

      {isAdmin && (
        <RagToolChips onReply={(msg) => appendAssistantBubble(msg)} />
      )}

      {/* Input area */}
    </div>
  );
}
```

### Custom RAG Action Handler
```typescript
// Custom handler for RAG responses
async function handleRagAction(action: string, params: any) {
  const res = await fetchJSON(`agent/tools/rag/${action}`, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (res?.ok) {
    toast.success(`✅ ${action} completed`);
    return res.result;
  } else {
    toast.error(`❌ ${action} failed`);
    throw new Error(res?.error || 'Unknown error');
  }
}
```

## Related Files

- Backend implementation: `apps/backend/app/services/rag_tools.py`
- Router endpoints: `apps/backend/app/routers/agent_tools_rag.py`
- Intent detection: `apps/backend/app/services/agent_detect.py`
- Frontend component: `apps/web/src/components/RagToolChips.tsx`
- Backend tests: `apps/backend/tests/test_agent_rag_tools.py`
- E2E tests: `apps/web/tests/e2e/rag-tools.spec.ts`
- Full docs: `docs/RAG_TOOLS_IMPLEMENTATION.md`
