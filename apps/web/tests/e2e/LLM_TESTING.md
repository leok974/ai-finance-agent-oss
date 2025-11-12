# LLM E2E Testing Guide

## Overview

LLM-dependent tests are isolated in `chat-llm.spec.ts` to prevent blocking fast CI/CD pipelines. These tests require:
- Real LLM backend (OpenAI API or local model)
- Backend status endpoint reporting `llm_ok: true`
- Longer timeouts (25-60s per test)

## Running LLM Tests

### Production Environment

```bash
# Run all LLM tests (serial, 1 worker)
pnpm run test:e2e:prod:llm

# Run specific LLM test
pnpm exec playwright test chat-llm.spec.ts -g "chat returns real LLM reply" --workers=1
```

### Local Development

```bash
# Ensure backend is running with LLM configured
export OPENAI_API_KEY="sk-..."
export LLM_MODEL="gpt-4"

# Run tests against local backend
BASE_URL=http://localhost:8000 pnpm exec playwright test chat-llm.spec.ts --workers=1
```

## Test Structure

### Health Check (beforeAll)
```typescript
// Soft-skip if LLM unavailable
const r = await request.get(`${BASE}/agent/status`);
const status = await r.json();
if (!status.llm_ok) test.skip(true, "LLM not ready");
```

### Warmup Phase
```typescript
// Prime model & caches (2 requests)
for (let i = 0; i < 2; i++) {
  await request.post(PATH, { data: warmupPayload });
}
```

### Assertion Strategy

**DO** - Shape-based assertions:
```typescript
expect(txt.length).toBeGreaterThan(8);
expect(/hello|hi|hey/i.test(txt)).toBeTruthy();
```

**DON'T** - Exact string matching:
```typescript
expect(txt).toBe("Hello!"); // ❌ Brittle
```

## CI/CD Integration

### Fast Lane (Always Run)
```bash
# Critical smoke tests (no LLM)
pnpm run test:e2e:prod -- -g "@prod-critical" --workers=2
```

### LLM Lane (Nightly/On-Demand)
```bash
# Serial execution, soft-skip if unavailable
pnpm run test:e2e:prod:llm
```

### GitHub Actions Example

```yaml
# .github/workflows/e2e-prod.yml
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm run test:e2e:prod -- -g "@prod-critical"

  llm:
    runs-on: ubuntu-latest
    # Run nightly or on manual trigger
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    steps:
      - run: pnpm run test:e2e:prod:llm
```

## Backend Requirements

### Status Endpoint

Must return `llm_ok: true` when LLM is ready:

```python
@router.get("/agent/status")
def agent_status():
    return {
        "llm_ok": check_llm_available(),
        "model": settings.LLM_MODEL,
        "provider": "openai",  # or "local"
    }
```

### Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4

# Or local model
LLM_PROVIDER=local
LLM_ENDPOINT=http://localhost:11434
```

## Troubleshooting

### Tests Always Skip
**Cause**: Backend `/agent/status` returns `llm_ok: false`

**Fix**:
- Verify `OPENAI_API_KEY` set
- Check backend logs for LLM initialization errors
- Ensure model name is valid

### Timeout Errors
**Cause**: LLM responses taking >25s

**Fix**:
```typescript
// Increase timeout in playwright.config.ts
timeout: 60_000, // for @requires-llm
```

### Flaky Assertions
**Cause**: LLM output varies

**Fix**: Use looser regex patterns:
```typescript
// Too strict
expect(txt).toContain("categories are");

// Better
expect(/categor/i.test(txt)).toBeTruthy();
```

## Test Coverage

| Test | Purpose | Expected Time |
|------|---------|---------------|
| `chat returns real LLM reply` | Basic LLM connectivity | 5-10s |
| `chat handles complex LLM query` | Multi-turn reasoning | 10-20s |
| `chat with conversation history` | Context retention | 8-15s |

## Best Practices

1. **Always warmup** - Prime model/caches before assertions
2. **Serial execution** - Use `--workers=1` to avoid LLM rate limits
3. **Soft skips** - Never fail if LLM unavailable (use `test.skip()`)
4. **Shape over content** - Assert structure, not exact wording
5. **Timeout budget** - Mark with `test.slow()` for 3x timeout
