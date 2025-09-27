# Unified Help API

The unified Help endpoint provides deterministic "what" explanations and AI (with fallback) "why" clarifications for UI cards via a single POST `/help` interface.

## Endpoint
`POST /help`

### Request Body
```
{
  "card_id": "overview",          // required
  "mode": "what" | "why",         // required
  "month": "2025-09" | null,      // optional
  "deterministic_ctx": { ... },    // JSON-serializable context used for fingerprinting and AI prompt
  "base_text": "..."              // required when mode = "why"
}
```

### Response (200)
```
{
  "mode": "what" | "why",
  "source": "deterministic" | "llm" | "fallback",
  "text": "<help text>",
  // when source == fallback a transient "error" string may be present
  "error": "<reason>" (optional)
}
```
Headers: `ETag: <hash>`

### Conditional (304)
If the client sends `If-None-Match: <etag>` and the cached item remains valid (not expired) and unchanged, the server returns `304 Not Modified` with the same `ETag` header and an empty body.

### Error Semantics
* Validation issues (`mode` invalid or missing `base_text` for why) return 400.
* Model / network / warmup failures NEVER surface as 5xx to the user; they are converted to a `fallback` payload with deterministic copy.

## Caching & Fingerprint
Cache key components:
* `card_id`
* `mode`
* `month` (or `na`)
* `REPHRASE_VERSION`
* `PRIMARY_MODEL_TAG`
* SHA-256 fingerprint of `deterministic_ctx` plus `base_text` (only for `why` mode)

TTL: `HELP_TTL_SECONDS` (default 86400 = 24h). Stored in DB table `help_cache` and validated on each access; expired rows are skipped (lazy pruning). An in-memory browser cache (see `helpTooltip.js`) further reduces network requests and honors 304 semantics.

### ETag Strategy
ETag derived from MD5 hash of the final `text` field only. Changing phrasing or rephrase version invalidates the cache. Model or prompt changes that alter text produce a new hash automatically. For a hard reset without changing text, bump `REPHRASE_VERSION`.

## Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| HELP_TTL_SECONDS | Cache TTL seconds | 86400 |
| REPHRASE_VERSION | Version token to force semantic refresh | v1 |
| PRIMARY_MODEL_TAG | Model tag used for why rephrase (also part of key) | gpt-oss:20b |

## Frontend Helper (`apps/web/src/lib/helpTooltip.js`)
Features:
* Memory + localStorage (24h) caching (key mirrors server inputs)
* ETag-aware: sends `If-None-Match` when possible, handles 304
* AbortController cancels duplicate rapid requests per key
* Soft client-side fallback message if fetch fails
* Distinguishes sources to allow UI badges (e.g., `(AI)` vs `(cached)`)

Usage example:
```js
import { getHelp } from '../lib/helpTooltip';

const res = await getHelp({
  cardId: 'overview',
  mode: 'what',
  month: '2025-09',
  ctx: { total: 1234 },
  baseText: null
});
console.log(res.text, res.source);
```

## Fallback Logic
When `mode=why` and the LLM call errors (timeout, network, warmup, provider 5xx), the backend returns deterministic explanatory text derived from the base summary with an appended clarification suffix. This guarantees a help tooltip is always shown.

## DB Schema (`help_cache`)
```
help_cache(
  id serial primary key,
  cache_key text unique,
  etag text,
  payload json/jsonb,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
```
Indexes: key (unique), etag, expires_at, (expires_at, cache_key) composite for eviction scans.

## Operational Notes
* To invalidate broadly, bump `REPHRASE_VERSION` or decrease `HELP_TTL_SECONDS` temporarily.
* Admin cache reset endpoint (future) can prune table; currently lazy expiry.
* Monitor size via future metrics (TBD). Entries are small (one paragraph + metadata).

## Future Enhancements (Backlog)
* Background pruning task for expired rows
* Metrics: hit/miss, fallback count, average latency
* Multi-language support via locale token in cache key
* Per-user personalization (would require user ID scoping in key)

---
Last updated: 2025-09-27
