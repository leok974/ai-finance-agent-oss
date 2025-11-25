# LLM Streaming with Local-First Provider Selection

## Overview

LedgerMind now uses **local-first LLM streaming** with automatic fallback to cloud providers. This architecture mirrors the non-streaming `call_llm` fallback logic for consistency.

## Architecture

### Provider Selection Strategy

```
Primary: Local Model (Ollama/NIM)
    ↓ (on failure)
Fallback: OpenAI API
```

**Key principles:**
- **Local-first**: Always try local inference first (faster, private, cost-effective)
- **Graceful degradation**: Fall back to OpenAI on local failures
- **Transparent**: Frontend doesn't know which provider served tokens
- **Consistent**: Streaming uses same provider logic as non-streaming

## Files

### `app/utils/llm_stream.py` (NEW)
Centralized streaming helper with provider fallback logic.

**Key functions:**
- `stream_llm_tokens_with_fallback()` - Main entry point
- `_stream_from_local()` - Ollama/NIM streaming via OpenAI-compatible API
- `_stream_from_openai()` - Cloud fallback streaming

**Event format:**
```python
{
    "type": "token",
    "data": {"text": "..."}
}
```

### `app/routers/agent.py`
Updated `/agent/stream` endpoint to use the new helper.

**Before:**
- Manual OpenAI-compatible streaming with `requests`
- No fallback logic
- ~80 lines of SSE parsing code

**After:**
- Clean integration: `async for token_event in stream_llm_tokens_with_fallback(...)`
- Automatic fallback to OpenAI
- ~20 lines

## Configuration

### Environment Variables

```bash
# Primary provider (always local-first)
DEFAULT_LLM_PROVIDER=ollama
DEFAULT_LLM_MODEL=gpt-oss:20b

# Local model endpoint
OPENAI_BASE_URL=http://localhost:11434/v1
OLLAMA_BASE_URL=http://ollama:11434

# OpenAI fallback (requires sk-* key)
OPENAI_API_KEY=sk-...
# OR via Docker secret:
OPENAI_API_KEY_FILE=/run/secrets/openai_api_key

# Fallback model mapping
OPENAI_FALLBACK_MODEL=gpt-4o-mini  # optional, auto-mapped
```

### Container Networking

In Docker environments:
- `localhost:11434` → auto-rewritten to `ollama:11434` service
- Backend container → Ollama service (internal network)
- Frontend → Backend → LLM (transparent)

## Provider Fallback Logic

### Local Provider (`_stream_from_local`)

1. Build OpenAI-compatible request:
   ```python
   POST {OPENAI_BASE_URL}/chat/completions
   {
     "model": "gpt-oss:20b",
     "messages": [...],
     "stream": true
   }
   ```

2. Parse SSE response:
   ```
   data: {"choices":[{"delta":{"content":"Hello"}}]}
   data: {"choices":[{"delta":{"content":" world"}}]}
   data: [DONE]
   ```

3. Yield token events:
   ```python
   {"type": "token", "data": {"text": "Hello"}}
   {"type": "token", "data": {"text": " world"}}
   ```

### OpenAI Fallback (`_stream_from_openai`)

Triggered on local failures:
- Connection errors (Ollama down)
- HTTP 404 (model not found)
- HTTP 5xx (server errors)
- Timeouts

Uses OpenAI API directly:
```python
POST https://api.openai.com/v1/chat/completions
{
  "model": "gpt-4o-mini",  # auto-mapped
  "messages": [...],
  "stream": true
}
```

## Logging

The streaming helper emits structured logs for debugging:

```
llm_stream.attempt provider=local rid=abc123
llm_stream.local start rid=abc123 base=http://ollama:11434/v1 model=gpt-oss:20b
llm_stream.local success rid=abc123

# On fallback:
llm_stream.provider_failed provider=local rid=abc123 error=Connection refused
llm_stream.attempt provider=openai rid=abc123
llm_stream.openai start rid=abc123 model=gpt-4o-mini (fallback for gpt-oss:20b)
llm_stream.openai success rid=abc123
```

## Testing

### Smoke Test

```bash
cd apps/backend
python test_streaming_smoke.py
```

Expected output:
```
🔧 Testing LLM streaming with local-first + fallback...

--- Streaming tokens ---
Hello there friend

✅ Streaming completed successfully!
📊 Total tokens: 5
```

### E2E Test

Frontend E2E tests in `apps/web/tests/e2e/chat-panel-streaming.spec.ts` verify:
- Thinking bubble with tool indicators
- Progressive token rendering
- Retry on network failures
- Cancel button stops stream
- Warmup indicator before first token

### Manual Testing

1. **Local-only (Ollama running)**:
   ```bash
   # Start Ollama
   docker compose up -d ollama

   # Test ChatDock
   curl http://localhost:8000/agent/stream?q=hello
   ```
   Expected logs: `llm_stream.local success`

2. **Fallback (Ollama stopped)**:
   ```bash
   # Stop Ollama
   docker compose stop ollama

   # Test ChatDock
   curl http://localhost:8000/agent/stream?q=hello
   ```
   Expected logs:
   ```
   llm_stream.provider_failed provider=local
   llm_stream.openai success
   ```

## Deployment Checklist

- [ ] `OPENAI_API_KEY` configured (for fallback)
- [ ] Ollama service running: `docker compose ps ollama`
- [ ] Model loaded: `docker exec -it ollama ollama list | grep gpt-oss:20b`
- [ ] Backend logs show: `llm_stream.local success`
- [ ] Frontend thinking bubble displays smoothly
- [ ] Fallback works when Ollama stopped

## Comparison: Streaming vs Non-Streaming

Both use the **same provider selection logic**:

| Feature | Non-Streaming (`call_llm`) | Streaming (`stream_llm_tokens_with_fallback`) |
|---------|---------------------------|----------------------------------------------|
| Primary provider | Ollama via OPENAI_BASE_URL | Ollama via OPENAI_BASE_URL |
| Fallback provider | OpenAI API | OpenAI API |
| Fallback trigger | 5xx, timeout, connection error | 5xx, timeout, connection error |
| Model mapping | `_model_for_openai()` | `_model_for_openai()` |
| Key resolution | `_get_effective_openai_key()` | `_get_effective_openai_key()` |
| Localhost rewrite | Yes (→ ollama:11434) | Yes (→ ollama:11434) |
| Logging | `LLM:call`, `LLM:fallback` | `llm_stream.*` |

## Frontend Integration

**No changes needed!** Frontend code is provider-agnostic:

```typescript
// apps/web/src/chat/useAgentStream.ts
const response = await fetch('/agent/stream?q=' + query);
const reader = response.body.getReader();

// Parse NDJSON events
for await (const event of parseNDJSON(reader)) {
  if (event.type === 'token') {
    appendToken(event.data.text);
  }
}
```

The frontend doesn't know (or care) whether tokens came from:
- Local Ollama model
- Cloud OpenAI API
- Future providers (Anthropic, etc.)

## Future Enhancements

1. **Multi-provider fallback chain**:
   ```
   Ollama → OpenAI → Anthropic → Error
   ```

2. **Provider health checks**:
   - Skip known-unhealthy providers
   - Circuit breaker pattern

3. **Provider selection strategies**:
   - Load balancing
   - Cost optimization
   - Latency-based routing

4. **Streaming metrics**:
   - Tokens/second
   - Time-to-first-token
   - Provider success rates

## Troubleshooting

### "Connection refused" on local model

**Symptoms:**
```
llm_stream.provider_failed provider=local error=Connection refused
```

**Fix:**
```bash
# Check Ollama service
docker compose ps ollama

# Restart if needed
docker compose restart ollama

# Verify endpoint
curl http://ollama:11434/api/tags
```

### "All providers failed"

**Symptoms:**
```
llm_stream.all_failed error=All LLM providers failed
```

**Causes:**
1. Ollama down + no OpenAI key
2. Ollama down + invalid OpenAI key
3. Network issues

**Fix:**
```bash
# Check Ollama
docker compose up -d ollama

# Verify OpenAI key
echo $OPENAI_API_KEY | grep '^sk-'

# Test OpenAI directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Streaming hangs / no tokens

**Symptoms:**
- Thinking bubble shows but no text appears
- Request times out

**Debug:**
```bash
# Check backend logs
docker compose logs -f backend | grep llm_stream

# Test local model directly
curl http://ollama:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-oss:20b","messages":[{"role":"user","content":"test"}],"stream":true}'
```

## Security Notes

- OpenAI API key stored in Docker secret (`/run/secrets/openai_api_key`)
- Never log API keys (redacted in logs)
- SSL/TLS for OpenAI API (https://api.openai.com)
- Local model traffic stays internal (no external calls)

## Performance

### Typical Latencies

| Metric | Local (Ollama) | Fallback (OpenAI) |
|--------|---------------|-------------------|
| Time to first token | 50-200ms | 200-500ms |
| Token throughput | 20-50 tokens/s | 30-80 tokens/s |
| Total latency (50 tokens) | 1-3s | 1-2s |

### Resource Usage

- **Local**: GPU memory (4-8GB for 20B model)
- **Fallback**: API costs ($0.15/1M tokens for gpt-4o-mini)

## References

- [OpenAI Streaming API](https://platform.openai.com/docs/api-reference/streaming)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
