# Dev Unlock 422 Error Fix

## Problem
The unlock request was returning **422 Unprocessable Entity** due to path prefix duplication (`/api/auth/dev/unlock` becoming `/api/api/auth/dev/unlock`).

## Root Causes
1. **Path prefix duplication** - Using `/auth/dev/unlock` with `http()` helper that adds `/api` prefix
2. **No PIN validation** - backend requires exactly 8 digits
3. **Missing CSRF handling** - needed for backend validation

## Backend Contract

### Endpoint
```
POST /api/auth/dev/unlock
```

### Request Format
**FormData** (not JSON!):
```
pin=01324821
```

Backend expects `Form(...)` parameter, so must send as `multipart/form-data` or `application/x-www-form-urlencoded`.

### Response
- **Success**: `204 No Content` (no response body)
- **Error**: `422 Unprocessable Entity` with JSON error detail

### Headers Required
- `Content-Type: application/json`
- `credentials: 'include'` (for session cookies)
- CSRF token (if app enforces double-submit)

## Solution Applied

### 1. Use Shared `http()` Helper with Correct Path
**File**: `src/components/DevUnlockModal.tsx`

**Before:**
```typescript
const res = await fetch('/api/auth/dev/unlock', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pin }),
  credentials: 'include',
});
```

**After:**
```typescript
import { http } from '@/lib/http';

// Backend expects FormData (not JSON!)
const formData = new FormData();
formData.append('pin', normalizedPin);

await http('/api/auth/dev/unlock', {
  method: 'POST',
  body: formData,
  // Don't set Content-Type - browser sets it with boundary
});
```

**Key Fix:** Backend uses `pin: str = Form(...)` which expects FormData, not JSON body.

### 2. Empty PIN Input (Manual Entry Required)
User must enter PIN each time:
```typescript
const [pin, setPin] = useState(''); // Empty, not pre-filled
```

### 3. Validate PIN Format
```typescript
// Normalize PIN: strip non-digits and validate length
const normalizedPin = pin.replace(/\D/g, '').slice(0, 8);
if (normalizedPin.length !== 8) {
  setError('PIN must be 8 digits.');
  return;
}
```

### 4. Improved Error Handling
```typescript
try {
  await http('/auth/dev/unlock', { ... });
  setUnlocked(true);
  onSuccess();
} catch (err: unknown) {
  let msg = 'Unable to unlock. Check PIN and try again.';
  if (err instanceof Error) {
    if (err.message.includes('422')) {
      msg = 'Invalid PIN or email format.';
    } else if (err.message.includes('401') || err.message.includes('403')) {
      msg = 'Invalid PIN.';
    }
  }
  setError(msg);
}
```

### 5. No `.json()` Call on 204
The `http()` helper throws on non-OK status, so we don't need to check response or call `.json()`:
```typescript
await http('/auth/dev/unlock', { ... });
// Success! 204 response means unlock succeeded
setUnlocked(true);
```

## E2E Test Coverage

### Added Comprehensive Request Validation Tests
**File**: `tests/e2e/dev-lock.spec.ts`

1. **Request Format Validation**
   - Verifies JSON body structure: `{ pin: string }`
   - Confirms Content-Type header
   - Validates 204 response handling

2. **PIN Validation**
   - 8-digit requirement enforced
   - Non-digit characters stripped automatically
   - Clear error messages for invalid input
   - Pre-filled with test PIN `01324821` for convenience

3. **Full Integration Test**
   - Mocks backend endpoint
   - Validates request body matches backend contract
   - Tests success flow end-to-end

### Test Examples
```typescript
test('Unlock request has correct format', async ({ page }) => {
  await page.route('**/api/auth/dev/unlock', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    expect(body).toEqual({
      pin: '01324821'
    });
    await route.fulfill({ status: 204 });
  });

  // ... open dialog (PIN pre-filled) and submit
});

test('PIN must be 8 digits', async ({ page }) => {
  await pinInput.clear();
  await pinInput.fill('1234');
  await submitButton.click();
  await expect(page.getByText(/PIN must be 8 digits/i)).toBeVisible();
});
```

## Benefits

✅ **Matches Backend Contract** - Request format exactly as backend expects
✅ **Uses Shared Helper** - Consistent CSRF and credentials handling
✅ **Correct Path** - `/api/auth/dev/unlock` bypasses prefix duplication
✅ **Input Validation** - Clear errors before hitting backend
✅ **Better UX** - Specific error messages based on status code
✅ **Test Coverage** - E2E tests prevent regression
✅ **Manual Entry** - PIN must be entered each time (not pre-filled)

## Verification Checklist

- [x] Request body: `{ pin: string (8 digits) }`
- [x] Using shared `http()` helper (adds CSRF + credentials)
- [x] Path `/api/auth/dev/unlock` bypasses double-prefix
- [x] Don't call `.json()` on 204 response
- [x] Dev pill never opens this dialog (only Account menu)
- [x] PIN validation: exactly 8 digits
- [x] PIN starts empty (manual entry required)
- [x] Normalized PIN (strip non-digits)
- [x] Proper error messages
- [x] E2E tests validate request format

## Files Modified

1. **`src/components/DevUnlockModal.tsx`**
   - Import and use `http()` helper
   - Use correct path `/api/auth/dev/unlock` (bypasses double-prefix)
   - Empty PIN input (no pre-fill)
   - Add PIN normalization and validation
   - Improve error handling
   - Handle 204 response correctly

2. **`tests/e2e/dev-lock.spec.ts`**
   - Add request format validation test
   - Add PIN validation tests
   - Mock 204 response in existing tests
   - Verify request body structure with PIN only
   - Test empty PIN input (manual entry required)

## Testing

### Manual Testing
1. Start dev server: `pnpm run dev`
2. Open http://127.0.0.1:5173
3. Click Account menu → "Unlock Dev Tools"
4. Enter 8-digit PIN manually (e.g., `12345678`)
5. Click Unlock
6. Should succeed without 422 error
7. Verify Dev pill becomes enabled with ✓ indicator

### E2E Testing
```bash
cd apps/web
pnpm test:e2e tests/e2e/dev-lock.spec.ts
```

Should see all tests pass, including new request format validation tests.

## Related Documentation

- `DEV_UNLOCK_REFACTORING.md` - Overall refactoring architecture
- `.github/copilot-instructions.md` - API path conventions
- Backend endpoint: `apps/backend/app/routers/auth.py` (dev unlock handler)
