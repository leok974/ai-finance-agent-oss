# Backend notes: Merchant canonicalization and suggestions

This backend stores a canonical form of `Transaction.merchant` in `transactions.merchant_canonical`.

- Canonicalization function: `app/utils/text.py` → `canonicalize_merchant(s: str) -> str | None`
  - Lowercases, strips diacritics, replaces punctuation with spaces, collapses whitespace.
  - Example: "  Café—Gamma  #12" → "cafe gamma 12"
- Storage and sync:
  - ORM sets `merchant_canonical` via a validator when `merchant` is written.
  - A migration added the column and backfilled existing rows, and created a non‑unique index.
- Service behavior:
  - Rule suggestions prefer SQL-side filtering on `transactions.merchant_canonical` when present.
  - Fallback to Python canonicalization if the column is missing (e.g., in older DBs).
- Recompute tool:
  - If you change the algorithm or bulk-load new data, recompute canonicals:
    - Script: `app/scripts/recanonicalize_merchants.py`
    - Options: `--batch <N>`, `--dry-run`, `--only-missing`
    - Quick command:
      - `python -m app.scripts.recanonicalize_merchants --only-missing`

Suggestions & preview
- When present, services prefer SQL-side filtering on `transactions.merchant_canonical` (faster and consistent).
- Preview/backfill share the same windowing and uncategorized filters; keep `window_days` consistent between calls.

Preview/Backfill windowing
- The `/rules/preview` and `/rules/{id}/backfill` endpoints use identical base/window/when filters.
- To keep counts consistent, the UI must pass the same `window_days` to both calls.
- Windowing is inclusive-by-day (>= cutoff.date()); uncategorized means NULL, empty, or "Unknown".

Migrations hardening
- `feedback.created_at` is NOT NULL with a DB default (now/CURRENT_TIMESTAMP). Indexes are guarded.
- The `merchant_canonical` migration includes a note: if the util changes later, rerun the recanonicalize script or add a follow-up migration.

### Environment flags

The backend uses `APP_ENV` (preferred) or `ENV` to decide behavior:

- `APP_ENV=prod` (default if unset) → production-safe (hides dev-only fields)
- `APP_ENV=dev` → enables extra debug fields (e.g. `merchant_canonical` in `/txns/recent`)
- `APP_ENV=test` → used in pytest runs

Never run prod deployments with `APP_ENV=dev`.
