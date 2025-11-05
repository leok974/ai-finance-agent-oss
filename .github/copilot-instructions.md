# Copilot Project Instructions – LedgerMind SPA

These rules are authoritative for code generation in this repository (frontend focus). Follow them unless a file-local comment explicitly overrides for a narrow scope.

## API Path Rules
1. Do **NOT** hardcode `/api/` in new code except for `/api/auth/*` endpoints (auth only).
2. All non‑auth API calls use relative paths like `rules`, `rules/{id}`, `charts/month-flows`.
3. Use the shared helper `fetchJSON` from `src/lib/http.ts` for all network calls (other than extremely low‑level primitives). Do not call `fetch` directly with string literals to the backend unless adding functionality to `fetchJSON` itself.
4. Respect `VITE_API_BASE` (defaults to `/`). Do not build full origins manually (`window.location.origin`, `http(s)://…`) for same-origin API calls.
5. Rules endpoints: `rules`, `rules/{id}` (GET/POST/PATCH/DELETE).
6. Charts endpoints: `charts/<dash-slug>` — convert any underscore slugs to dashes before calling.
7. Suggestions: There is **NO** root suggestions collection endpoint. Do not call `/suggestions` or `/api/suggestions`.
8. Auth endpoints temporarily remain under `/api/auth/*`.

## Slug Normalization
Use a tiny helper (or inline) `slug.replace(/_/g, "-")` before forming a charts path. Prefer a shared utility if reused more than twice.

## Networking Conventions
- Always go through `fetchJSON(path, { query, method, body })`.
- Ensure `credentials: 'same-origin'` and `cache: 'no-store'` are preserved (helper already does this; if modifying it, keep these semantics).
- Pass query params via the `query` object; the helper serializes them.

## CSP / Security
- No inline `<script>` or inline style injections for new code.
- Do not add `<meta http-equiv="Content-Security-Policy">` — CSP comes from server headers.
- Avoid dynamic script tag injection unless strongly justified; prefer module imports.

## Refactor Guidance
When touching legacy code:
- Replace `fetch('/api/rules`...) with `fetchJSON('rules', { query })`.
- Replace `fetch('/api/charts/month_flows')` with `fetchJSON('charts/month-flows')`.
- Remove or flag unreachable code referencing `/api/suggestions`.
- Add tests or type refinements if you adjust response shapes.

## DO / DON'T Quick Table
| Do | Don't |
|----|-------|
| `fetchJSON('rules')` | `fetch('/api/rules')` |
| `fetchJSON('charts/' + slug.replace(/_/g,'-'))` | `fetch('/api/charts/' + slug)` |
| `fetchJSON('/api/auth/login', { method: 'POST', body: ... })` | Hardcode `/api/` for non-auth |
| Centralize slug normalization | Scatter regex replacements |

## Commit Checklist
- [ ] No new `/api/` literals except `/api/auth/`.
- [ ] All chart paths use dash slugs.
- [ ] No calls to suggestions root.
- [ ] fetchJSON used everywhere (except inside the helper itself).
- [ ] Typecheck passes.

## Rationale
We are removing temporary Nginx shims (/api/rules → /rules). Aligning the SPA early reduces migration risk and allows security tightening.

(Feel free to extend with path‑specific instructions by adding `src/api/.instructions.md` if needed.)
