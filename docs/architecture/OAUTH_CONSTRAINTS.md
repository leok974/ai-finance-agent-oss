# OAuth & Demo User Separation - Permanent Architecture Constraints

**Status:** ✅ LOCKED - Do not modify without security review
**Last Updated:** 2025-11-27
**Version:** 1.0.0

---

## 🔒 Critical Invariants

These rules MUST be preserved in all future development. Violations will break authentication security and demo isolation.

---

## 1. Demo User Isolation (MANDATORY)

### Rule: Demo Users NEVER Link to OAuth

**Enforcement:**

```python
# REQUIRED CHECK in OAuth callback (apps/backend/app/auth/google.py)
if user and (user.is_demo or user.is_demo_user):
    raise HTTPException(
        status_code=400,
        detail="This email is reserved for demo purposes..."
    )
```

**Prohibited Operations:**
- ❌ Creating `OAuthAccount` records for `is_demo=True` users
- ❌ Creating `OAuthAccount` records for `is_demo_user=True` users
- ❌ Creating `OAuthAccount` records for `DEMO_USER_ID` (ID=1)
- ❌ Matching demo email (`demo@ledger-mind.local`) in OAuth flows
- ❌ Reusing demo user identity for real user login

**Why:** Demo accounts must remain completely isolated to prevent:
- Cross-contamination of demo/real data
- Security leaks between demo and production users
- UI confusion (showing wrong email addresses)

---

## 2. OAuth Resolution Order (IMMUTABLE)

### Rule: Always Follow This Exact Sequence

**Required Flow:**

```python
# Step 1: Look up by OAuth account FIRST (primary key)
oauth_account = db.query(OAuthAccount).filter(
    OAuthAccount.provider == "google",
    OAuthAccount.provider_user_id == google_sub,
).first()

if oauth_account:
    # Case A: OAuth exists → Use linked user
    user = oauth_account.user
    # Update profile (name, picture, email) if changed

elif user_by_email := db.query(User).filter(
    User.email == email,
    User.is_demo.is_(False),  # MUST exclude demo users
).first():
    # Case B: User exists, no OAuth → Create OAuth link
    # SAFETY CHECK REQUIRED:
    if user_by_email.is_demo or user_by_email.is_demo_user:
        raise HTTPException(400, "Cannot link OAuth to demo account")

    oauth_account = OAuthAccount(
        user_id=user_by_email.id,
        provider="google",
        provider_user_id=google_sub,
        email=email,
    )
    db.add(oauth_account)

else:
    # Case C: Neither exists → Create new user + OAuth
    user = User(
        email=email,
        password_hash="",  # OAuth users don't have passwords
        is_demo=False,     # MUST be False
        name=name,
        picture=picture,
    )
    db.add(user)
    db.flush()

    oauth_account = OAuthAccount(
        user_id=user.id,
        provider="google",
        provider_user_id=google_sub,
        email=email,
    )
    db.add(oauth_account)
```

**Order MUST NOT Change:**
1. ✅ OAuth account lookup (by `provider` + `provider_user_id`)
2. ✅ Email match for existing non-demo users
3. ✅ New user creation (never demo)

**Rationale:** This order prevents:
- Duplicate OAuth accounts
- Account hijacking
- Demo user contamination

---

## 3. Email Trust & Profile Sync

### Rule: Google Email is Source of Truth for OAuth Users

**Required Behavior:**

```python
# Always sync profile data from Google on login
if name and user.name != name:
    user.name = name
if picture and user.picture != picture:
    user.picture = picture
if email and user.email != email:
    user.email = email
    oauth_account.email = email
```

**Constraints:**
- ✅ Trust email from Google `userinfo` endpoint
- ✅ Update user email if changed in Google account
- ❌ NEVER update `is_demo` users via OAuth
- ❌ NEVER override Google email with local defaults

---

## 4. OAuthAccount Uniqueness (DATABASE CONSTRAINT)

### Rule: One Google Account = One User

**Database Constraint (REQUIRED):**

```python
# SQLAlchemy Model (apps/backend/app/orm_models.py)
class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    provider: Mapped[str] = mapped_column(String(32))
    provider_user_id: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_user_id",
            name="uq_oauth_provider_user"
        ),
    )
```

**Migration (apps/backend/alembic/versions/20250910_oauth_accounts.py):**
- ✅ MUST maintain `uq_oauth_provider_user` constraint
- ✅ Constraint applies to ALL dialects (PostgreSQL, SQLite)

**Prevents:**
- Same Google account linking to multiple users
- OAuth account duplication
- Account takeover attacks

---

## 5. Database Identity Rules

### Rule: Fixed User IDs for Demo vs Real Users

**Canonical State:**

```sql
-- User ID 1: Demo User (NEVER OAuth)
id = 1
email = 'demo@ledger-mind.local'
is_demo = TRUE
is_demo_user = TRUE
password_hash = (hashed)
-- NO OAuth accounts allowed

-- User ID 3: Real User (Leo)
id = 3
email = 'leoklemet.pa@gmail.com'
is_demo = FALSE
is_demo_user = FALSE
password_hash = ''  -- OAuth user, no password
-- HAS OAuth account (provider='google', provider_user_id='...')

-- User ID 5: Real User (Conal)
id = 5
email = 'conalminer@gmail.com'
is_demo = FALSE
is_demo_user = FALSE
password_hash = ''  -- OAuth user, no password
-- HAS OAuth account (provider='google', provider_user_id='...')
```

**Verification Query:**

```sql
SELECT
    u.id,
    u.email,
    u.is_demo,
    u.is_demo_user,
    oa.provider,
    oa.provider_user_id
FROM users u
LEFT JOIN oauth_accounts oa ON u.id = oa.user_id
ORDER BY u.id;
```

**Expected Results:**
- ✅ User 1: NO OAuth account (NULL provider/provider_user_id)
- ✅ User 3, 5: HAVE OAuth accounts (provider='google')

---

## 6. Testing Requirements (MANDATORY)

### Rule: OAuth Changes MUST Pass All Tests

**Test File:** `apps/backend/app/tests/test_auth_google_oauth.py`

**Required Test Coverage (9/9 MUST PASS):**

1. ✅ **Existing OAuth Reuse** - No duplicate users/accounts
2. ✅ **Profile Updates** - Name/picture/email sync from Google
3. ✅ **Link to Existing User** - Email match creates OAuth link
4. ✅ **New User Creation** - Both user + OAuth account created
5. ✅ **Demo Protection** - Cannot link OAuth to `is_demo` users
6. ✅ **State Mismatch** - CSRF protection (state parameter)
7. ✅ **Missing PKCE** - PKCE verifier required
8. ✅ **Missing Email** - Email required from Google
9. ✅ **Missing Sub** - Google `sub` (user ID) required

**Pre-Merge Requirements:**
- ✅ All 9 tests passing
- ✅ No new OAuth code without extending tests
- ✅ Coverage maintained or improved

**Run Tests:**

```bash
cd apps/backend
pytest app/tests/test_auth_google_oauth.py -v
```

---

## 7. Frontend Rules

### Rule: Email Display ONLY from /api/auth/me

**Source of Truth:**

```typescript
// apps/web/src/state/auth.tsx
useEffect(() => {
  const me = await getWithAuth<User>("/api/auth/me");
  setUser(me);  // me.email is the ONLY email to display
}, []);
```

**Display Location:**

```tsx
// apps/web/src/components/AuthMenu.tsx
{user.email}  // Shows Gmail for OAuth users, demo email for demo users
```

**Prohibited:**
- ❌ Hardcoding email addresses in UI
- ❌ Overriding email from localStorage
- ❌ Deriving email from tokens manually

---

## 8. Migration & Deployment Rules

### Rule: Demo User Fix Migration is Permanent

**Migration:** `apps/backend/alembic/versions/20251127_fix_demo_user.py`

**What It Does:**

```python
# Update demo user (ID=1)
op.execute("""
    UPDATE users
    SET email = 'demo@ledger-mind.local',
        is_demo = true,
        is_demo_user = true
    WHERE id = 1;
""")

# Delete erroneous dev@local users
op.execute("""
    DELETE FROM users
    WHERE email = 'dev@local';
""")
```

**Constraints:**
- ✅ This migration MUST remain in repo
- ✅ Future migrations MUST NOT modify user ID 1
- ✅ Future migrations MUST NOT reassign OAuth accounts
- ✅ Demo user email MUST stay `demo@ledger-mind.local`

---

## 9. Security Guardrails

### CSRF Protection (REQUIRED)

```python
# OAuth state parameter validation
state_qs = request.query_params.get("state")
state_sess = request.session.get("oauth_state")

if not state_qs or not state_sess or state_qs != state_sess:
    raise HTTPException(400, "OAuth state mismatch")
```

### PKCE Protection (REQUIRED)

```python
# PKCE verifier validation
verifier = request.session.get("oauth_pkce_verifier")
if not verifier:
    raise HTTPException(400, "OAuth PKCE verifier missing")

token = await oauth.google.authorize_access_token(
    request,
    code_verifier=verifier
)
```

### Google Sub Validation (REQUIRED)

```python
# Google sub (user ID) must be present
google_sub = userinfo.get("sub")
if not google_sub:
    raise HTTPException(400, "No user ID from OAuth provider")
```

---

## 10. Code Review Checklist

Before approving ANY OAuth-related changes:

- [ ] Demo user isolation preserved (no OAuth for `is_demo` users)
- [ ] OAuth resolution order unchanged (OAuth → email → new user)
- [ ] Email sync from Google maintained
- [ ] Uniqueness constraint on `(provider, provider_user_id)` intact
- [ ] All 9 tests passing
- [ ] No hardcoded emails in frontend
- [ ] CSRF protection active (state parameter)
- [ ] PKCE protection active (code_verifier)
- [ ] Migration `20251127_fix_demo_user.py` unchanged
- [ ] Database state verified (user 1 = demo, no OAuth)

---

## 11. Monitoring & Observability

**Prometheus Metrics (apps/backend/app/auth/google.py):**

```python
auth_callback_total.labels(result="ok").inc()           # Success
auth_callback_total.labels(result="error").inc()        # Failure
auth_callback_total.labels(result="state_mismatch").inc()
auth_callback_total.labels(result="token_exchange_failed").inc()

oauth_token_exchange_seconds.observe(duration)
```

**Alert Thresholds:**
- ⚠️ `auth_callback_total{result="error"}` > 5% of total
- ⚠️ `oauth_token_exchange_seconds` p95 > 2s
- 🚨 Any attempt to create OAuth for user ID 1 (should never happen)

---

## 12. Rollback Plan

If OAuth breaks in production:

1. **Immediate:** Disable OAuth login button in UI
2. **Fallback:** Use password login for existing users
3. **Investigate:** Check logs for:
   - State mismatch errors
   - PKCE failures
   - Demo user linking attempts
4. **Restore:** Roll back to tag `v1.0.0` if needed:

```bash
git checkout v1.0.0
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

5. **Verify:** Run verification query:

```sql
SELECT COUNT(*) FROM oauth_accounts WHERE user_id = 1;
-- MUST be 0
```

---

## 13. Documentation References

- **Architecture:** [docs/architecture/ARCHITECTURE.md](ARCHITECTURE.md)
- **AI Agent Rules:** [docs/development/AGENTS.md](../development/AGENTS.md)
- **Verification Runbook:** [docs/ops/FIX-DEMO-USER-SEPARATION.md](../ops/FIX-DEMO-USER-SEPARATION.md)
- **OAuth Implementation:** `apps/backend/app/auth/google.py`
- **OAuth Model:** `apps/backend/app/orm_models.py` (OAuthAccount)
- **Tests:** `apps/backend/app/tests/test_auth_google_oauth.py`

---

## 14. Future Enhancements (Allowed)

These changes are PERMITTED as long as core constraints are preserved:

✅ **Add more OAuth providers** (GitHub, Microsoft, etc.)
- Must follow same resolution order
- Must enforce demo user isolation
- Must maintain uniqueness constraints

✅ **Add timestamps to OAuthAccount** (created_at, updated_at)
- Safe addition, no breaking changes

✅ **Add OAuth unlinking endpoint**
- Allow users to disconnect Google account
- Must not affect demo users

✅ **Add OAuth provider badges in UI**
- Show "Signed in with Google" indicator
- Must use email from `/api/auth/me` only

✅ **Enhance test coverage**
- More edge cases welcome
- Must not reduce existing coverage

---

## 15. Prohibited Changes

These changes are FORBIDDEN without architecture review:

❌ **Changing OAuth resolution order**
❌ **Allowing OAuth for demo users**
❌ **Removing uniqueness constraint on OAuthAccount**
❌ **Hardcoding emails in UI**
❌ **Modifying migration `20251127_fix_demo_user.py`**
❌ **Deleting any of the 9 OAuth tests**
❌ **Bypassing CSRF or PKCE checks**
❌ **Changing user ID 1 (demo user)**
❌ **Creating OAuth accounts for `is_demo=True` users**

---

## Version History

| Version | Date       | Changes                           |
|---------|------------|-----------------------------------|
| 1.0.0   | 2025-11-27 | Initial constraints documented    |

---

**This document is CANONICAL. All future OAuth development must comply with these rules.**
