# LLM Router Fallback Flag - Implementation Summary

**Date:** November 3, 2025
**Status:** ✅ COMPLETE

---

## Problem

The `_router_fallback_active` flag was being set incorrectly:
1. ❌ Always `True` regardless of actual LLM usage
2. ❌ Unconditionally set by `analytics_tag.py` function
3. ❌ Not set in bypass/primary LLM path
4. ❌ Health check not integrated with chat router

**Impact:**
- UI "Why?" buttons disabled (depend on `_router_fallback_active === false`)
- No way to distinguish primary LLM responses from deterministic fallbacks
- Misleading analytics/metrics

---

## Solution Implemented

### 1. Added Health Check Integration to Chat Handler
**File:** `apps/backend/app/routers/agent.py` (lines ~1320-1360)

```python
# Check LLM health before attempting to call
from app.services.llm_health import is_llm_available
import asyncio

llm_available = asyncio.run(is_llm_available(use_cache=True))

if not llm_available:
    # Return deterministic fallback
    resp = {
        "reply": "The AI assistant is temporarily unavailable...",
        "model": "deterministic",
        "_router_fallback_active": True,  # ✅ True when falling back
        "mode": "fallback",
        "fallback_reason": "llm_health_check_failed",
    }
    return JSONResponse(resp, headers={"X-LLM-Path": "fallback-health"})

# Primary path - LLM available
resp = {
    "reply": reply,
    "model": model,
    "_router_fallback_active": False,  # ✅ False when using primary LLM
    "mode": "primary",
}
```

###2. Fixed Bypass Path Response
**File:** `apps/backend/app/routers/agent.py` (lines ~858-868)

**Before:**
```python
resp = {
    "reply": reply,
    "model": model,
    # ❌ Missing _router_fallback_active
}
```

**After:**
```python
resp = {
    "reply": reply,
    "model": model,
    "_router_fallback_active": False,  # ✅ Bypass uses primary LLM
    "mode": "primary",
}
if fb:  # If fallback provider used
    resp["_router_fallback_active"] = True  # ✅ Override
```

### 3. Fixed Analytics Tagger (analytics_tag.py)
**File:** `apps/backend/app/services/agent/analytics_tag.py`

**Before:**
```python
# Breadcrumb always added so we can detect tagger activation
resp["_router_fallback_active"] = True  # ❌ ALWAYS True!
return resp
```

**After:**
```python
if looks_analytics and not has_mode:
    # Only NOW set fallback flag since we're actually falling back
    resp["_router_fallback_active"] = True  # ✅ Only when injecting fallback
# else: mode exists (primary LLM) - preserve existing value
return resp
```

### 4. Added Convenience Function to llm_health.py
**File:** `apps/backend/app/services/llm_health.py`

```python
async def is_llm_available(use_cache: bool = True) -> bool:
    """
    Simple boolean check for LLM availability.
    Can be overridden with LM_LLM_FORCE_PRIMARY=1 environment variable.
    """
    if os.getenv("LM_LLM_FORCE_PRIMARY") == "1":
        return True  # Force primary path (bypass health check)

    result = await ping_llm(use_cache=use_cache)
    return result["ok"]
```

---

## Validation Results

### ✅ All Tests Passing

```bash
# 1. Health Check
$ curl -sL http://localhost/agent/status | jq
{
  "ok": true,
  "llm_ok": true,
  "provider": "ollama",
  "base_url": "http://ollama:11434"
}

# 2. Generic Query (non-analytics)
$ curl -sL http://localhost/agent/chat \
  -d '{"messages":[{"role":"user","content":"Hello"}],"force_llm":true}'
{
  "_router_fallback_active": false,  # ✅
  "model": "gpt-oss:20b",
  "mode": "primary"
}

# 3. Analytics Query (with 'budget' keyword)
$ curl -sL http://localhost/agent/chat \
  -d '{"messages":[{"role":"user","content":"Give me a budgeting tip"}],"force_llm":true}'
{
  "_router_fallback_active": false,  # ✅
  "model": "gpt-oss:20b",
  "mode": "primary"
}
```

---

## Files Modified

| File | Purpose | Lines Changed |
|------|---------|---------------|
| `apps/backend/app/services/llm_health.py` | Added `is_llm_available()` | +17 |
| `apps/backend/app/routers/agent.py` | Health check integration, bypass path fix | ~50 |
| `apps/backend/app/services/agent/analytics_tag.py` | Fixed unconditional flag setting | ~10 |

---

## Behavior Matrix

| Scenario | `_router_fallback_active` | `model` | `mode` |
|----------|---------------------------|---------|--------|
| ✅ LLM available, force_llm=true | `false` | `gpt-oss:20b` | `primary` |
| ✅ LLM available, router (non-analytics) | `false` | `deterministic` | `nl_txns` etc |
| ✅ LLM available, router (analytics) | ` false` (if mode set) | varies | varies |
| ❌ LLM unavailable, force_llm=true | `true` | `deterministic` | `fallback` |
| ❌ Analytics query, no mode set | `true` | `deterministic` | `analytics.fallback` |

---

## Feature Flag: Force Primary Mode

**Environment Variable:** `LM_LLM_FORCE_PRIMARY=1`

**Purpose:** Bypass health check and always use primary LLM path (useful for demos with flaky health probes)

**Usage:**
```bash
# In docker-compose.prod.yml or secrets/backend.env
LM_LLM_FORCE_PRIMARY=1
```

**Behavior:**
- `is_llm_available()` always returns `True`
- Skips health probe entirely
- LLM failures will surface as 500 errors instead of graceful fallback

---

## UI Integration Ready

The "Why?" button can now be enabled based on:

```typescript
const { _router_fallback_active, mode, model } = response;

// Enable "Why?" button when:
const canShowWhy =
  _router_fallback_active === false &&  // Primary LLM used
  mode === "primary" &&                 // Not a router tool response
  model !== "deterministic";             // Real model used

<Button
  disabled={!canShowWhy}
  onClick={() => askWhy()}
>
  Why?
</Button>
```

---

## Testing Checklist

- [x] Health check returns `llm_ok: true`
- [x] Generic query sets `_router_fallback_active: false`
- [x] Analytics query with LLM sets `_router_fallback_active: false`
- [x] Fallback mode sets `_router_fallback_active: true`
- [x] Bypass path includes flag
- [x] Router path includes flag
- [x] Force primary flag works (`LM_LLM_FORCE_PRIMARY=1`)

---

## Regression Test (Optional)

```python
# tests/test_agent_fallback_flag.py
from unittest.mock import patch
import pytest

@pytest.mark.asyncio
async def test_router_fallback_flag_primary():
    """When LLM available, _router_fallback_active should be False"""
    with patch('app.services.llm_health.is_llm_available', return_value=True):
        response = await client.post('/agent/chat', json={
            "messages": [{"role": "user", "content": "Hello"}],
            "force_llm": True
        })
        assert response.json()["_router_fallback_active"] is False
        assert response.json()["model"] != "deterministic"

@pytest.mark.asyncio
async def test_router_fallback_flag_unavailable():
    """When LLM unavailable, _router_fallback_active should be True"""
    with patch('app.services.llm_health.is_llm_available', return_value=False):
        response = await client.post('/agent/chat', json={
            "messages": [{"role": "user", "content": "Hello"}],
            "force_llm": True
        })
        assert response.json()["_router_fallback_active"] is True
        assert response.json()["model"] == "deterministic"
```

---

## Related Docs

- Health check fix: `docs/llm-health-fix-summary.md`
- Quick reference: `docs/llm-health-quick-ref.md`
- Dev endpoints: `docs/dev-endpoints-validation.md`

---

## Commit Message

```
fix(agent): correctly set _router_fallback_active flag

- Integrated LLM health check into chat handler
- Set flag to false when using primary LLM path
- Set flag to true only when actually falling back
- Fixed analytics_tag unconditionally setting flag to true
- Added is_llm_available() convenience function
- Added LM_LLM_FORCE_PRIMARY flag to bypass health check

Before: _router_fallback_active always true (broke "Why?" buttons)
After: Correctly reflects primary vs fallback usage

Enables: UI "Why?" button activation, accurate analytics
```
