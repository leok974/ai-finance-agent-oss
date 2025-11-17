# Finance Agent Web

## API Bases

The frontend distinguishes between non-auth and auth endpoints to remove reliance on legacy `/api` shims.

Environment variables:

- `VITE_API_BASE`: Historical base (often `/api`). Non-auth calls derive their root by stripping a trailing `/api` if present. Fallback: `/`.
- `VITE_AUTH_API_BASE`: Optional explicit auth base (default `/api`). Auth endpoints remain at `/api/auth/*`.

### Examples

- `fetchJSON('rules')` → `/rules`
- `fetchJSON('charts/month-flows')` → `/charts/month-flows`
- `fetchAuth('/auth/login')` → `/api/auth/login`

### Helper Exports

From `src/lib/http.ts`:

- `fetchJSON(path, { query, method, body })` — non-auth
- `fetchAuth(path, { ... })` — auth (path starts with `/auth`)
- `dashSlug(str)` — converts underscores to dashes for chart slugs
- `NON_AUTH_BASE` — resolved root base

### Migration Rationale

We are deprecating Nginx shims like `/api/rules` in favor of canonical root paths (`/rules`). This reduces indirection, simplifies CSP and proxy rules, and makes local dev + future multi-origin setups clearer.

### Adding New Calls

1. Prefer relative resource names without a leading slash for non-auth: `fetchJSON('txns/unknowns')`.
2. Normalize chart slugs with `dashSlug` when constructing dynamic chart paths.
3. Only use `fetchAuth` for `/auth/*` endpoints.
4. Do not introduce hardcoded non-auth `/api/` prefixes; ESLint will block them.

### Lint Rule

See `.eslintrc.cjs` for a `no-restricted-syntax` rule preventing literals matching `/^\/api\/(?!auth\//)`.

### Testing Notes

Vitest config sets `VITE_API_BASE` to `''` in tests, so `NON_AUTH_BASE` resolves to `/`. Auth still points to `/api`.

---

## ChatDock CSS Build Guard

The `apps/web` build runs a post-build check to ensure ChatDock CSS is not orphaned:

```bash
pnpm build   # runs vite build + verify:chat-css
```

This verification script checks that required ChatDock selectors (`.lm-chat-shell`, `.lm-chat-launcher`, `.lm-chat-launcher-bubble`) are present in the CSS files referenced by `dist/index.html`.

**Why this guard exists:**

- Prevents regressions where `chat/index.css` compiles into an orphaned chunk
- Ensures chat UI styles are always included in production builds
- Fails the build early with a clear error message if CSS imports are broken

If you remove or rename the chat CSS imports, the build will fail with:

```
[verify-chat-css] ERROR: ChatDock selectors missing from referenced CSS files:
  - .lm-chat-shell
  - .lm-chat-launcher
```

**Manual verification:**

```bash
pnpm verify:chat-css  # run after building
```

---

Generated as part of API base split & shim retirement initiative.
