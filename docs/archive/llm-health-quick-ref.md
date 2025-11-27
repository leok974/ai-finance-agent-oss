# LLM Health Check - Quick Reference

## ✅ What Was Fixed

**Problem:** `/agent/status` hardcoded to probe `localhost:11434` → always failed in Docker
**Solution:** Created `llm_health.ping_llm()` using correct service name (`http://ollama:11434`)
**Result:** Health check now accurately reports LLM availability ✅

---

## 🔍 Quick Tests

### 1. Health Check
```bash
curl -sL http://localhost/agent/status | jq '.llm_ok'
# Expected: true
```

### 2. Model List
```bash
curl -sL http://localhost/agent/models | jq '.models[]? | .id'
# Expected: ["gpt-oss:20b", "default", "nomic-embed-text:latest"]
```

### 3. Warmup
```bash
curl -sL -X POST http://localhost/api/agent/warmup | jq '.ok, .took_ms'
# Expected: true, <10
```

### 4. Chat
```bash
curl -sL http://localhost/api/agent/gpt \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hi"}]}' \
  | jq -r '.model'
# Expected: gpt-oss:20b (not "deterministic")
```

---

## 📁 Files Modified

| File | Purpose | Lines |
|------|---------|-------|
| `apps/backend/app/services/llm_health.py` | New health check service | 83 |
| `apps/backend/app/routers/agent.py` | Updated `/agent/status` endpoint | 1577-1600 |

---

## 🔧 How It Works

```
┌─────────────────┐
│ /agent/status   │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ llm_health.ping_llm │
│ • Uses OLLAMA_BASE_URL
│ • 5s TTL cache
│ • Provider-aware
└────────┬────────────┘
         │
         ▼
┌──────────────────────┐
│ http://ollama:11434  │
│ GET /api/tags        │
└──────────────────────┘
```

---

## ⚙️ Configuration

### Required Env Vars (Already Set)
```bash
OLLAMA_BASE_URL=http://ollama:11434
OPENAI_BASE_URL=http://ollama:11434/v1
DEFAULT_LLM_PROVIDER=ollama
```

### Docker Service Name
```yaml
# docker-compose.prod.yml
services:
  ollama:
    image: ollama/ollama:latest
    # Backend resolves this as "http://ollama:11434"
```

---

## 🐛 Troubleshooting

### Health check fails?
```bash
# 1. Check DNS
docker exec backend getent hosts ollama

# 2. Test connectivity
docker exec backend curl -sf http://ollama:11434/api/tags

# 3. Check env vars
docker exec backend printenv | grep OLLAMA_BASE_URL
```

### Clear cache
```python
from app.services.llm_health import clear_health_cache
clear_health_cache()
```

---

## 📊 Expected Response

### Success
```json
{
  "ok": true,
  "llm_ok": true,
  "provider": "ollama",
  "base_url": "http://ollama:11434",
  "model": "gpt-oss:20b"
}
```

### Failure
```json
{
  "ok": false,
  "llm_ok": false,
  "error": "Connection refused: ...",
  "provider": "ollama",
  "base_url": "http://ollama:11434"
}
```

---

## 🎯 Why This Matters

Before:
- ❌ Health check: "Connection refused"
- ✅ Chat: Works fine (LLM actually available)
- 🤔 UI: Disables features based on broken health signal

After:
- ✅ Health check: Accurate status
- ✅ Chat: Works fine
- ✅ UI: Can enable features when LLM available

---

## 📚 Related Docs

- Full details: `docs/llm-health-fix-summary.md`
- Dev unlock: `docs/LEDGERMIND_DEV_OVERRIDE.md`
- Validation results: `docs/dev-endpoints-validation.md`
