# Production E2E Test Tags

Use these tags in test titles to control which tests run in different environments.

## Tag Definitions

### `@prod-safe`
**Safe to run against production**
- Read-only operations (dashboard loads, header checks, cache validation)
- User-scoped mutations (CSV uploads that only affect test user)
- No risk of data corruption or privacy violations

**Example:**
```typescript
test.describe("@prod-safe", () => {
  test("loads dashboard", async ({ page }) => { /* ... */ });
});
```

### `@dev-only`
**Requires dev routes (automatically skipped in prod)**
- User seeding via `/api/dev/seed-user`
- Dev endpoint testing
- Database reset operations
- Any test that calls `/api/dev/*` endpoints

**Example:**
```typescript
test("@dev-only seeds test user", async ({ page }) => { /* ... */ });
```

### `@needs-seed`
**Requires fresh database state**
- Tests that depend on empty database
- Tests that need specific seed data
- Cannot run against production with real user data

**Example:**
```typescript
test("@needs-seed shows empty state", async ({ page }) => { /* ... */ });
```

## Playwright Config Integration

The `chromium-prod` project automatically skips tests with these tags:

```typescript
{
  name: "chromium-prod",
  testIgnore: /@dev-only|@needs-seed/,  // Skips these patterns
  // ...
}
```

## Best Practices

1. **Always tag production tests** with `@prod-safe`
2. **Tag dev-only tests** to prevent accidental production runs
3. **Use descriptive test names** that explain what's being tested
4. **Add session checks** for authenticated tests:
   ```typescript
   test.beforeEach(async ({ page }) => {
     await assertLoggedIn(page);
   });
   ```

## Examples

### Good: Clear tagging
```typescript
test.describe("@prod-safe", () => {
  test("authenticated dashboard loads", async ({ page }) => {
    await assertLoggedIn(page);
    await page.goto("/");
    await expect(page.getByTestId("account-button")).toBeVisible();
  });
});
```

### Good: Dev-only marked
```typescript
test("@dev-only creates test data via dev routes", async ({ page }) => {
  await page.request.post("/api/dev/seed-user", { /* ... */ });
});
```

### Bad: No tags (ambiguous)
```typescript
test("upload works", async ({ page }) => {
  // Is this safe for prod? Unclear!
});
```

## Tag Combinations

You can combine tags if needed:

```typescript
test.describe("@prod-safe CSV uploads", () => {
  test("@needs-empty-account uploads to fresh account", async ({ page }) => {
    // This would run in prod ONLY if account is empty
  });
});
```

## Related

- Session validation: `tests/e2e/utils/prodSession.ts`
- Production guide: `tests/e2e/PROD-TESTING.md`
- Config: `playwright.config.ts` (chromium-prod project)
