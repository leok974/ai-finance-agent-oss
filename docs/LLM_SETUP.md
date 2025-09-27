# LLM Setup & Operations

> How to configure local + remote language models, understand the `/agent/models` vs legacy `/llm/models` endpoints, and validate model health in the UI.

## Overview
The system supports a **primary local model provider** (e.g. Ollama) and **optional fallback remote providers** (e.g. OpenAI, vLLM, or other OpenAI-compatible APIs). The frontend derives overall *model availability* (`modelsOk`) from the merged model registry exposed by the backend.

```
[Frontend] ── fetch /agent/models (NEW canonical) ─▶ [Backend adapter layer]
                     ▲                                │
                     │ (shim)                         │
                /llm/models (legacy)                  │
                     │                                ▼
             (temporary compatibility)         Providers / Backends
                                                   • Ollama (local)
                                                   • OpenAI / Compatible
                                                   • Future: Anthropic, etc.
```

## Endpoint Evolution
| Phase | Endpoint | Status | Notes |
|-------|----------|--------|-------|
| Legacy | `GET /llm/models` | Deprecated (shim served temporarily) | Backward compatibility only; expect removal soon. |
| Current | `GET /agent/models` | Canonical | Superset / filtered aggregation; all new code must use this. |
| Future | `GET /agent/chat` etc. | Planned refinement | Consolidate generation & tool invocation under `/agent/*`. |

Action: Migrate any automation or scripts still calling `/llm/models` to `/agent/models` immediately. Shim removal is scheduled after the defined deprecation window (see Deploy Checklist).

## Model Provider Layers
| Provider | Mode | Typical URL / Host | Configuration Source | Notes |
|----------|------|--------------------|----------------------|-------|
| Ollama | Local | `http://ollama:11434` (Docker network) | `docker-compose*.yml` + implicit | Primary if available; zero‑latency LAN. |
| OpenAI | Remote SaaS | `https://api.openai.com` | `OPENAI_API_KEY` secret (if integrated) | Used only if key present. |
| Other OpenAI-Compatible (vLLM, LM Studio, etc.) | Remote / Local | Custom base URL | Future env var(s) | Must speak OpenAI REST schema. |

If multiple are present, the backend may merge/annotate models. The UI surfaces first healthy provider set.

## Environment Variables (Current Set)
| Variable | Required? | Purpose |
|----------|-----------|---------|
| `DISABLE_PRIMARY` | No | When set truthy, disables *local* primary model (e.g. force fallback) for test scenarios. |
| `OPENAI_API_KEY` | Optional | Enables remote OpenAI fallback; absence means no SaaS calls. |
| `OLLAMA_HOST` (future) | Planned | Override auto-detected Ollama URL if running outside Compose network. |

> Note: Only `DISABLE_PRIMARY` is currently referenced in docs; others are implicit or planned. Update this section as new providers are wired.

## Frontend Health Derivation
The frontend state store (`llmStore`) performs:
1. Fetch `/agent/models` periodically (or on demand, e.g., panel open).
2. Validate non-empty model list after filtering out disabled/errored entries.
3. Derive `modelsOk = true` when at least one usable model is available.
4. Expose `modelsOk` to feature gates (Explain / Rephrase, etc.).

### Pseudocode Flow
```ts
const models = await api.fetchAgentModels();
const active = models.filter(m => !m.disabled && m.health === 'ok');
const modelsOk = active.length > 0;
```

### Legacy Handling
If an older web bundle still calls `/llm/models`, the backend shim responds with the same payload shape (or a subset). This prevents breakage while caches flush. New code must use `/agent/models`.

## Verification Checklist
| Step | Command / Action | Expected Result |
|------|------------------|-----------------|
| 1 | Start stack (`docker compose up -d`) | Backend healthy (`/ready` 200). |
| 2 | Query models (`curl localhost:8000/agent/models`) | JSON array, length ≥ 1 (if primary enabled). |
| 3 | Disable primary (`DISABLE_PRIMARY=1` then restart backend) | `/agent/models` still returns non-empty if fallback configured, else empty (modelsOk=false). |
| 4 | Frontend UI Explain button | Visible + enabled when `modelsOk=true`; disabled state otherwise. |
| 5 | Legacy shim test (`curl /llm/models`) | 200 while deprecation window active. |

## Common Issues & Resolutions
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `modelsOk=false` & empty `/agent/models` | Primary (Ollama) not running and no fallback key | Start Ollama container or supply `OPENAI_API_KEY`. |
| `/agent/models` 502 via tunnel but reachable locally | Cloudflare tunnel mis-origin (HTTPS vs HTTP) | Ensure `cloudflared` origin is `http://nginx:80`. |
| Legacy web build calling `/llm/models` gets 404 | Shim removed post-deprecation | Rebuild frontend; update endpoint to `/agent/models`. |
| Explain/Rephrase buttons missing | Feature gating by `modelsOk` | Validate health fetch call path and network console. |

## Migration Plan (Deprecating `/llm/models`)
1. Provide at least one tagged release with both endpoints (this phase).
2. Communicate deprecation in CHANGELOG / README.
3. Add server log warning on `/llm/models` access (future small improvement).
4. Remove shim after N releases (define policy, e.g., 2 minor versions).

## Extending Providers
When adding a new provider:
1. Implement backend adapter returning consistent model metadata: `{ id, name, provider, health, disabled? }`.
2. Merge into `/agent/models` aggregation function.
3. Add ENV toggle(s) and document them here.
4. Extend smoke tests (see `SMOKE_TESTS.md`) to assert presence/health.
5. Update README env var table.

## Observability Hooks (Future Enhancements)
| Idea | Benefit |
|------|---------|
| Add `/agent/models/refresh` POST | Manual cache bust for admin use. |
| Emit structured log on model health change | Faster ops diagnosis. |
| Prometheus gauge: `agent_models_available` | Alerting on zero healthy models. |

## FAQ
**Q: Does the backend attempt failover automatically?**  
A: Yes—if local primary is disabled or unhealthy, only fallback-listed models appear; the frontend logic remains the same.

**Q: Are model generation endpoints also changing?**  
A: Planned; they will consolidate under `/agent/*` for clarity (e.g., `/agent/chat`).

**Q: How do I test fallback only?**  
A: Set `DISABLE_PRIMARY=1`, ensure fallback provider credentials are present, restart backend, confirm `/agent/models` still non-empty.

---
Update this document when: a new provider is added, the shim is removed, or new env vars are introduced.
