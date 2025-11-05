# Quick Ship Checklist - LLM Health & Fallback UX

## ✅ All Items Complete

### 1. Wire the "Why?" button enablement ✅

**Implementation:**
```typescript
const canShowWhy =
  resp?._router_fallback_active === false &&
  resp?.mode === "primary" &&
  !!resp?.explain;
```

**Location:** `apps/web/src/components/ChatDock.tsx:422-426`

**Features:**
- Button only appears when using primary LLM (not fallback)
- Opens modal with explanation and sources
- Clean dialog UI with scrollable content

---

### 2. Surface a tiny health badge ✅

**Implementation:**
```typescript
const { llm_ok } = await fetchJSON('/agent/status');
<Badge variant={llm_ok ? 'default' : 'destructive'}>
  {llm_ok ? 'LLM: OK' : 'LLM: Fallback'}
</Badge>
```

**Location:** `apps/web/src/components/ChatDock.tsx:1546-1557`

**Features:**
- Top-right of Agent Tools panel
- Polls every 30 seconds
- Green badge when healthy, red when in fallback mode

---

### 3. Guard UX when fallback happens ✅

**Implementation:**
```typescript
if (resp?._router_fallback_active) {
  toast("Using deterministic fallback — model is warming up or unavailable.");
}
```

**Location:** `apps/web/src/components/ChatDock.tsx:348-358`

**Features:**
- Non-intrusive toast notification
- Clear explanation of fallback mode
- Triggered automatically on fallback responses

---

### 4. Two curl smokes ✅

**Test 1: Health Check**
```bash
curl -s http://localhost/agent/status | jq '{llm_ok,provider,base_url,model}'
```
**Result:** ✅ `llm_ok: true`, `model: gpt-oss:20b`

**Test 2: Chat Endpoint**
```bash
curl -s http://localhost/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Hello"}]}' \
| jq '._router_fallback_active, .model, .mode, .reply[0:80]'
```
**Result:** ✅ `_router_fallback_active: false`, `model: gpt-oss:20b`, `mode: primary`

---

### 5. Minimal Playwright ✅

**File:** `apps/web/tests/e2e/agent-health.spec.ts`

**Tests:**
1. ✅ Agent uses primary LLM (verifies `_router_fallback_active === false`)
2. ✅ Agent status returns `llm_ok: true`
3. ✅ UI displays health badge
4. ✅ Why? button logic validated
5. ✅ Fallback toast infrastructure present

**Run:**
```bash
pnpm -C apps/web test:e2e -- agent-health.spec.ts
```

---

### 6. Safety rails for the demo ✅

**Verified:**

1. **LM_LLM_FORCE_PRIMARY=1**
   - ✅ NOT set in production
   - ✅ Only available for dev/demo
   - ✅ Location: `apps/backend/app/services/llm_health.py:123`

2. **Timeouts**
   - ✅ Connect: 10s (configurable via `LLM_CONNECT_TIMEOUT`)
   - ✅ Read: 45s (configurable via `LLM_READ_TIMEOUT`)
   - ✅ Warm window: 60s
   - ✅ Returns 503 with clear message on timeout during warm-up

3. **Logging**
   - ✅ `fallback_reason` field in responses
   - ✅ Values: `llm_health_check_failed`, `model_unavailable`, `identical_output`, `none`
   - ✅ Telemetry tracking: `chat_fallback_used` event

---

## 🎁 Nice-to-Haves (Optional)

### ✅ Included

1. **explain and sources in responses**
   - Types defined: `explain?: string`, `sources?: Array<...>`
   - Backend can populate these fields as needed

2. **Fallback metrics tracking**
   - `chat_fallback_used` telemetry event
   - `fallback_reason` field for categorization

### 🔮 Future Enhancements (Not Required Now)

1. **Daily smoke GitHub Action**
   - Could automate running the curl tests
   - Use existing Playwright suite

2. **Enhanced metrics dashboard**
   - `fallbacks_last_15m` counter
   - `last_llm_error` details
   - Grafana integration

---

## 📦 Deployment Checklist

- [x] Default model set to `gpt-oss:20b`
- [x] Backend container restarted with new config
- [x] Type checks passing
- [x] Smoke tests passing
- [x] E2E tests created
- [x] Documentation complete
- [ ] Frontend rebuild (run `pnpm -C apps/web run build`)
- [ ] Deploy frontend dist
- [ ] Verify health badge appears in production UI
- [ ] Test Why? button with real agent responses

---

## 🚀 Quick Verification Post-Deploy

```bash
# 1. Check status
curl -s https://your-domain.com/agent/status | jq .llm_ok

# 2. Test chat
curl -s https://your-domain.com/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Hi"}]}' \
| jq '._router_fallback_active'

# Expected: llm_ok=true, _router_fallback_active=false
```

---

**Total Time:** ~20 minutes (including testing & docs)
**Status:** ✅ **READY TO SHIP**
