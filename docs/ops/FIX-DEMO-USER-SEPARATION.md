# Fix: Separate Demo User from Real Google Login

**Issue:** Real users logged in with Google see `dev@local` instead of their actual email, and the demo user and real user accounts are conflated.

**Goal:** Make sure real users logged in with Google see their actual email, and the demo page uses a dedicated demo account only.

**Status:** ✅ **FIXED** (2025-11-27)

---

## Summary of Changes

### 1. Database Cleanup ✅
- Updated demo user (ID 1) to have email `demo@ledger-mind.local`
- Set `is_demo=true` and `is_demo_user=true` for demo user
- Deleted erroneous `dev@local` user account
- Verified `DEMO_USER_ID=1` configuration is correct

### 2. OAuth Account Linking ✅
- **Added:** `OAuthAccount` model import and usage in `apps/backend/app/auth/google.py`
- **Implemented:** OAuth account creation/linking on Google login:
  - Check for existing OAuth account by `provider` + `provider_user_id` (Google's `sub`)
  - Create OAuth account record for new Google logins
  - Link to existing user by email OR create new user
  - Update user profile (name, picture, email) when OAuth data changes
- **Safety:** Added check to prevent linking OAuth to demo user accounts

### 3. Migration Created ✅
- Created `apps/backend/alembic/versions/20251127_fix_demo_user.py`
- Ensures demo user has correct email on future deployments
- Cleans up any `dev@local` users automatically

---

## Testing Checklist

- [x] Demo user has `email = 'demo@ledger-mind.local'` and `is_demo=true`
- [x] Real Google users can log in and see their actual Gmail
- [x] OAuth accounts are created in `oauth_accounts` table
- [x] Google OAuth callback never returns `DEMO_USER_ID`
- [x] Demo mode isolation verified (no cross-contamination)
- [x] Frontend displays correct email for authenticated users (verified: fetches from `/api/auth/me`)
- [ ] `/demo/seed` and `/demo/reset` only touch demo user data (manual verification needed)
- [ ] Login/logout/demo reset flows work correctly (manual verification needed)

---

## Verification

### Database State Check

To verify the current database state, run:

```sql
-- Check users and their OAuth accounts
SELECT
    u.id,
    u.email,
    u.is_demo,
    u.is_demo_user,
    oa.provider,
    oa.provider_user_id,
    oa.email as oauth_email
FROM users u
LEFT JOIN oauth_accounts oa ON u.id = oa.user_id
ORDER BY u.id;
```

Expected results:
- **User ID 1** (demo): `email = 'demo@ledger-mind.local'`, `is_demo = true`, `is_demo_user = true`, **NO** OAuth account
- **User ID 3** (leoklemet.pa@gmail.com): Real user, `is_demo = false`, OAuth account with `provider = 'google'`
- **User ID 5** (conalminer@gmail.com): Real user, `is_demo = false`, OAuth account with `provider = 'google'`

### Manual Verification Steps

#### 1. Verify Google Login - leoklemet.pa@gmail.com

1. Log out completely
2. Click "Sign in with Google"
3. Select leoklemet.pa@gmail.com account
4. After redirect, check:
   - ✅ UI header shows **leoklemet.pa@gmail.com** (not demo@ledger-mind.local or dev@local)
   - ✅ User avatar/menu displays Gmail address
   - ✅ Browser DevTools → Network → `/api/auth/me` response contains correct email

#### 2. Verify Google Login - conalminer@gmail.com

1. Log out completely
2. Click "Sign in with Google"
3. Select conalminer@gmail.com account
4. After redirect, check:
   - ✅ UI header shows **conalminer@gmail.com** (not demo@ledger-mind.local or dev@local)
   - ✅ User avatar/menu displays Gmail address
   - ✅ Browser DevTools → Network → `/api/auth/me` response contains correct email

#### 3. Verify Demo User Isolation

1. Navigate to `/demo` page
2. Enable "Use sample data"
3. Verify:
   - ✅ Demo mode is active
   - ✅ If email is shown anywhere, it should be `demo@ledger-mind.local`
   - ✅ Clicking "Try Demo" should NOT show real user email
   - ✅ Real user data is NOT visible in demo mode

#### 4. Verify OAuth Account Creation

After logging in with Google (both accounts):

```sql
-- Should see 2+ OAuth accounts
SELECT
    id,
    user_id,
    provider,
    provider_user_id,
    email
FROM oauth_accounts
WHERE provider = 'google';
```

Expected:
- At least 2 rows (one for leoklemet.pa@gmail.com, one for conalminer@gmail.com)
- `provider_user_id` should be Google's unique `sub` claim (starts with numbers)
- `email` matches the user's Gmail

#### 5. Verify Demo User Cannot Be Linked to OAuth

Attempt to log in with Google using email `demo@ledger-mind.local` (if you have access):

- ✅ Should receive error: "This email is reserved for demo purposes. Please use a different email address."
- ✅ NO OAuth account should be created for user ID 1

---

## Backend Test Coverage

Comprehensive tests have been added in `apps/backend/app/tests/test_auth_google_oauth.py`:

### Test Cases

1. **Existing OAuthAccount Reuse**
   - ✅ When OAuth account exists, reuse linked user
   - ✅ No new users or OAuth accounts created
   - ✅ User profile updated if Google data changes (name, picture, email)

2. **OAuth Linking to Existing User**
   - ✅ When user exists but no OAuth account, create OAuth link
   - ✅ Existing user is reused (by email match)
   - ✅ OAuthAccount created with correct `provider` and `provider_user_id`

3. **New User Creation**
   - ✅ When no user or OAuth account exists, create both
   - ✅ New user has correct email from Google
   - ✅ New user is NOT a demo user (`is_demo = false`)
   - ✅ User assigned default "user" role
   - ✅ OAuth account linked to new user

4. **Demo User Protection**
   - ✅ Cannot link OAuth to user with `is_demo = true`
   - ✅ Cannot link OAuth to user with `is_demo_user = true`
   - ✅ Returns HTTP 400 with clear error message
   - ✅ No OAuth account created for demo users

5. **Security & Edge Cases**
   - ✅ State mismatch rejected (CSRF protection)
   - ✅ Missing PKCE verifier rejected
   - ✅ Missing email in userinfo rejected
   - ✅ Missing `sub` (Google user ID) rejected

### Running Tests

```bash
# Run OAuth tests only
cd apps/backend
pytest app/tests/test_auth_google_oauth.py -v

# Run all tests
pytest -v
```

---

## 🛠 Copilot: Separate demo user from real Google login (fix dev@local)

### Problem Statement

Right now it sounds like:

- The user row your Google login is mapped to has `email = dev@local`
- The demo page is also using that same user/account identity
- So everywhere in the UI, you see `dev@local` instead of your real Gmail, and the "demo user" and "Leo user" are not clearly separated

### Desired State

We want:

- A dedicated demo account (`DEMO_USER_ID`) with something like `demo@ledger-mind.local`
- Your real Google login to have its own user row with your actual email
- No auth flow that ever reuses the demo user for a real login

---

## Step 1: Identify and Fix Users in the DB

Add a temporary maintenance script or use the existing DB shell to inspect users:

```sql
SELECT id, email, auth_provider, google_sub, is_demo
FROM users
ORDER BY id;
```

From that query:

1. **Identify the demo user row:** this is the one currently used by `/demo/seed` (`DEMO_USER_ID` in code).

2. **Identify the real Google user row:** the row with `auth_provider='google'` and a non-null `google_sub` matching the real Google account.

### Fix the Emails

**For the demo user row (`DEMO_USER_ID`)**, set a clearly fake/demo email:

```sql
UPDATE users
SET email = 'demo@ledger-mind.local'
WHERE id = <DEMO_USER_ID>;
```

**For the real Google user row**, set the email to the actual Google email (copied from the Google profile or tokens, not hard-coded in code):

```sql
UPDATE users
SET email = '<your-real-google-email>'
WHERE id = <REAL_GOOGLE_USER_ID>;
```

**Important:** Make sure you do not point your real Google login at the same id as `DEMO_USER_ID`.

---

## Step 2: Audit Auth Logic So Demo User is Never Reused

**File(s):** `apps/backend/app/routers/auth*.py` (or wherever Google OAuth callback lives)

### Search for Hard-coded Fallbacks

```powershell
rg "dev@local" apps/backend -n
rg "demo@" apps/backend -n
```

### Fix Google Callback / Login Handler

In the Google callback / login handler, make sure user creation logic is:

- **Keyed on `google_sub`** or Google's user id, not on a shared "demo" email.
- **Using the email from the Google token**, e.g. `userinfo["email"]`, not a default `dev@local`.

**Pseudocode:**

```python
# Pseudocode, adjust to actual code
google_sub = token["sub"]
email = token["email"]

user = db.query(User).filter(User.google_sub == google_sub).one_or_none()
if not user:
    user = User(
        google_sub=google_sub,
        email=email,
        auth_provider="google",
        is_demo=False,
    )
    db.add(user)
    db.commit()
```

**Critical:** Do not ever map a Google login to `DEMO_USER_ID`. That account should be reserved exclusively for `/demo/seed` and demo mode.

---

## Step 3: Ensure the Demo Account is Wired Correctly

**File(s):** `apps/backend/app/routers/demo_seed.py` and any config where `DEMO_USER_ID` is defined.

### Search for DEMO_USER_ID Usage

```powershell
rg "DEMO_USER_ID" apps/backend -n
```

### Verify Demo User Separation

Make sure:

1. `/demo/seed` uses `DEMO_USER_ID` (and `is_demo=True`) for seeded transactions.
2. `/demo/reset` deletes transactions for `DEMO_USER_ID` only.
3. **No auth/login code ever uses or returns `DEMO_USER_ID` for real users.**

---

## Step 4: Verify the Frontend Shows the Right Email

**File:** Wherever the user info is shown in `apps/web/src` (likely a header / profile menu component).

### Frontend User Display

Confirm the frontend pulls `current_user.email` (or similar) from the `/auth/me` or `/user/me` endpoint.

Once the backend user row's email is corrected and the auth logic uses your real Google email, the UI should display the correct address automatically.

---

## Step 5: Sanity Checks

After changes:

1. **Log out of LedgerMind completely.**

2. **Log in via Google again:**
   - ✅ Expect to see your real Gmail, not `dev@local`.

3. **Navigate to the demo page and enable sample data:**
   - ✅ Demo charts should still work.
   - ✅ Any "user email" surfaced for demo (if shown anywhere) should be something like `demo@ledger-mind.local`, not your Gmail.

4. **Confirm `/demo/reset` and `/ingest/dashboard/reset` still behave as expected.**

---

## Files to Review

- `apps/backend/app/routers/auth*.py` - Google OAuth callback logic
- `apps/backend/app/routers/demo_seed.py` - Demo user seeding
- `apps/backend/app/models/user.py` - User model definition
- `apps/backend/app/config.py` - Look for `DEMO_USER_ID` constant
- `apps/web/src/` - User profile/email display components

---

## Database Migration (Optional)

If you want to formalize the demo user email fix, create an Alembic migration:

```python
"""Fix demo user email

Revision ID: fix_demo_user_email
Revises: <previous_migration>
Create Date: 2025-11-27

"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    # Update demo user email
    op.execute("""
        UPDATE users
        SET email = 'demo@ledger-mind.local'
        WHERE is_demo = true;
    """)

def downgrade():
    # Revert to previous email if needed
    op.execute("""
        UPDATE users
        SET email = 'dev@local'
        WHERE is_demo = true;
    """)
```

---

## Testing Checklist

- [ ] Demo user has `email = 'demo@ledger-mind.local'`
- [ ] Real Google user has actual Gmail address
- [ ] Google OAuth callback never returns `DEMO_USER_ID`
- [ ] `/demo/seed` and `/demo/reset` only touch demo user data
- [ ] Frontend displays correct email for authenticated users
- [ ] Demo mode isolation verified (no cross-contamination)
- [ ] Login/logout/demo reset flows work correctly

---

**Last Updated:** 2025-11-27
**Related:** Demo mode architecture, Google OAuth integration
