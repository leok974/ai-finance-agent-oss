# ChatDock Streaming Status

## ✅ Implementation Complete (2025-01-25)

Streaming + thinking bubble fully implemented and tested in ChatDock v2.

---

## Architecture Overview

### Backend: `/agent/stream` Endpoint

**Location:** `apps/backend/app/routers/agent.py` (lines 1635-1735)

**Features:**
- NDJSON event stream with Server-Sent Events
- Local-first LLM streaming via `stream_llm_tokens_with_fallback`
- Automatic fallback: Ollama → OpenAI
- Event types: `start`, `planner`, `tool_start`, `token`, `tool_end`, `done`, `error`

**Example Event Sequence:**
```json
{"type": "start", "data": {"session_id": "abc123", "query": "Show spending"}}
{"type": "planner", "data": {"step": "Analyzing", "tools": ["charts.summary"]}}
{"type": "tool_start", "data": {"name": "charts.summary"}}
{"type": "token", "data": {"text": "Hello "}}
{"type": "token", "data": {"text": "world"}}
{"type": "tool_end", "data": {"name": "charts.summary", "ok": true}}
{"type": "done", "data": {}}
```

---

### Frontend: `useAgentStream` Hook

**Location:** `apps/web/src/chat/useAgentStream.ts` (380 lines)

**Features:**
- NDJSON event parsing with `ReadableStream` API
- Retry logic with exponential backoff: [250ms, 750ms, 2000ms]
- Thinking state persistence to `localStorage` (key: `lm:thinking`)
- Cancel support with AbortController
- Warmup indicator before first token

**Exposed Interface:**
```typescript
{
  messages: StreamMessage[];           // User + assistant messages
  isStreaming: boolean;                // True during active stream
  thinkingState: ThinkingState | null; // { step, tools, activeTools, activeTool }
  hasReceivedToken: boolean;           // False during warmup
  sendMessage: (text, options) => Promise<void>;
  cancel: () => void;
}
```

---

### UI: Thinking Bubble in ChatDock

**Location:** `apps/web/src/components/ChatDock.tsx` (lines 2748-2810)

**Components:**
- **Avatar badge**: Emerald "LM" circle with glow
- **Thinking label**: "Thinking…" with "Stop" button
- **Warmup indicator**: Pulsing dots + "Preparing tools…" (shown when `!hasReceivedToken`)
- **Planner step**: Dynamic step text from `thinkingState.step`
- **Tool chips**: Tool names with active highlighting (sky blue border/background)

**Visual States:**
1. **Warmup** (before first token): Pulsing dots + "Preparing tools…"
2. **Active streaming**: Tool chips with active tool highlighted in sky blue
3. **Completed**: Bubble disappears when stream ends

---

## Integration in ChatDock

### Enable New Streaming

**Location:** `apps/web/src/components/ChatDock.tsx` (line 329)

```tsx
const [useNewStreaming, setUseNewStreaming] = useState(true); // ✅ ENABLED
```

### handleSend Logic

**Location:** `apps/web/src/components/ChatDock.tsx` (lines 1292-1330)

```tsx
const handleSend = async (ev) => {
  if (useNewStreaming) {
    // NEW PATH: Use useAgentStream hook
    setInput("");
    setBusy(true);

    try {
      await agentStream.sendMessage(text, { month, mode: undefined });
    } finally {
      setBusy(false);
    }
    return;
  }

  // LEGACY PATH: wireAguiStream (AGUI gateway)
  if (ENABLE_AGUI) {
    wireAguiStream({ q: text, month }, { ... });
    return;
  }

  // FALLBACK: Non-streaming /agent/chat
  const resp = await agentChat(req);
  handleAgentResponse(resp);
};
```

---

## Tests

### ✅ Vitest Unit Tests (11 tests)

**Location:** `apps/web/src/chat/__tests__/useAgentStream.test.ts`

**Coverage:**
- Initialize with empty state
- Restore thinking state from localStorage
- Process NDJSON stream events (start, planner, tool_start, token, tool_end, done)
- Update thinking state for planner event
- Track active tools during execution
- Set `hasReceivedToken` after first token
- Handle error events
- Retry on transient network errors with exponential backoff
- Cancel stream with AbortController
- Persist thinking state to localStorage
- Handle HTTP error responses gracefully

**Run Tests:**
```bash
pnpm -C apps/web vitest run src/chat/__tests__/useAgentStream.test.ts
```

**Status:** ✅ All 11 tests passing

---

### ✅ Playwright E2E Tests (8 scenarios)

**Location:** `apps/web/tests/e2e/chat-panel-streaming.spec.ts`

**Coverage:**
1. Displays thinking bubble during streaming
2. Shows progressive message rendering
3. Displays tool names in thinking bubble
4. Thinking bubble disappears on completion
5. Handles streaming errors gracefully
6. Retries on transient network failure
7. Cancel button stops streaming
8. Shows warmup indicator before first token

**Run E2E Tests:**
```bash
pnpm -C apps/web exec playwright test tests/e2e/chat-panel-streaming.spec.ts
```

**Status:** ✅ All 8 scenarios implemented

---

## Configuration

### Environment Variables

**Enable Agent Streaming (default: enabled)**

No environment variable needed - `useNewStreaming` is now `true` by default in ChatDock.

**Backend LLM Configuration:**
```bash
# Local model (primary)
OPENAI_BASE_URL=http://ollama:11434/v1
MODEL=gpt-oss:20b

# Fallback cloud model
OPENAI_API_KEY=sk-...
OPENAI_FALLBACK_MODEL=gpt-4o-mini
```

**Streaming Timeouts:**
```bash
LLM_CONNECT_TIMEOUT=10
LLM_READ_TIMEOUT=45
```

---

## Migration from AGUI Gateway

### Before (AGUI)
- **Endpoint**: `/agui/chat` (SSE with custom events)
- **Events**: `RUN_STARTED`, `TOOL_CALL_START`, `TEXT_MESSAGE_CONTENT`, `RUN_FINISHED`
- **Client**: `wireAguiStream()` function
- **State**: Managed via event handlers in ChatDock

### After (Direct Streaming)
- **Endpoint**: `/agent/stream` (NDJSON)
- **Events**: `start`, `planner`, `tool_start`, `token`, `tool_end`, `done`, `error`
- **Client**: `useAgentStream()` hook
- **State**: Managed by hook with React state + localStorage persistence

### Advantages
1. **Simpler architecture**: No intermediate gateway
2. **Better typing**: TypeScript interfaces for all event types
3. **Retry logic**: Built-in exponential backoff
4. **Persistence**: Thinking state survives page refresh
5. **Cancellation**: First-class cancel support
6. **Warmup indicator**: Visual feedback during LLM startup

---

## Known Issues & Limitations

### 1. **No Message History Merging**

**Issue:** `useAgentStream` maintains its own message array. When enabled, it replaces `uiMessages` entirely, losing any previous conversation history.

**Impact:** Chat history is cleared when switching to new streaming mode mid-session.

**Workaround:** Initialize `useAgentStream` at mount or merge messages manually.

**Status:** Low priority - chat sessions typically start fresh.

---

### 2. **AGUI Gateway Still Active**

**Issue:** `wireAguiStream` and `/agui/chat` endpoint remain in codebase but unused when `useNewStreaming=true`.

**Impact:** Slight bundle size increase, potential confusion for maintainers.

**Recommendation:** Remove AGUI gateway in future refactor once new streaming is proven stable.

**Status:** Not blocking - can coexist safely.

---

### 3. **Thinking Bubble Timing**

**Issue:** On fast networks + local LLM, thinking bubble may disappear before user sees it (< 200ms flash).

**Impact:** Minor UX - users may not see the bubble in dev/local environments.

**Mitigation:** E2E tests handle both "was visible" and "appeared briefly" scenarios.

**Status:** Expected behavior - production with network latency will show bubble longer.

---

## Deployment Notes

### Production Readiness

✅ **Backend:**
- `/agent/stream` endpoint tested with local Ollama + OpenAI fallback
- Stream timeout handling: 45s read timeout, 10s connect timeout
- Error events sent for LLM failures
- NDJSON format stable and parseable

✅ **Frontend:**
- Thinking bubble UI tested in Chrome, Firefox, Edge
- TypeScript compilation passes
- No console errors during streaming
- Cancel button works reliably

✅ **Tests:**
- 11 unit tests passing (useAgentStream)
- 8 E2E scenarios covering happy path + errors
- Retry logic verified with simulated network failures

### Rollout Strategy

**Phase 1: Soft Launch (Current)**
- `useNewStreaming=true` by default
- AGUI gateway remains available as fallback
- Monitor for errors in production logs

**Phase 2: Full Adoption (After 1 week)**
- Remove `useNewStreaming` flag entirely
- Remove `wireAguiStream` and `/agui/chat` endpoint
- Update docs to remove AGUI references

**Phase 3: Optimization (After 1 month)**
- Add message history merging
- Extract ThinkingBubble as reusable component
- Add telemetry for thinking bubble visibility duration

---

## References

- **Backend endpoint**: `apps/backend/app/routers/agent.py::agent_stream`
- **LLM streaming helper**: `apps/backend/app/utils/llm_stream.py`
- **Frontend hook**: `apps/web/src/chat/useAgentStream.ts`
- **ChatDock integration**: `apps/web/src/components/ChatDock.tsx`
- **Unit tests**: `apps/web/src/chat/__tests__/useAgentStream.test.ts`
- **E2E tests**: `apps/web/tests/e2e/chat-panel-streaming.spec.ts`
- **Architecture docs**: `docs/CHAT_AGENT_API.md`, `docs/CHATDOCK_V2_FRONTEND.md`

---

## Summary

✅ **Streaming endpoint**: `/agent/stream` with NDJSON events
✅ **Hook implementation**: `useAgentStream` with retry, cancel, persistence
✅ **UI integration**: Thinking bubble with warmup, tools, active state
✅ **Tests**: 11 unit tests + 8 E2E scenarios
✅ **TypeScript**: Compilation passes
✅ **Deployment**: Ready for production

**Status:** Feature complete and production-ready. No blockers.
