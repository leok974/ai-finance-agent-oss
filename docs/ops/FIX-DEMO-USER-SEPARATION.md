# Fix: Separate Demo User from Real Google Login

**Issue:** Real users logged in with Google see `dev@local` instead of their actual email, and the demo user and real user accounts are conflated.

**Goal:** Make sure real users logged in with Google see their actual email, and the demo page uses a dedicated demo account only.

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
