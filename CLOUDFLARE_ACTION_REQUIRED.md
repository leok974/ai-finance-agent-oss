# 🎯 FINAL ACTION REQUIRED: Cloudflare Cache Purge

## Investigation Complete ✅

**Root Cause Confirmed**: Cloudflare edge cache serving stale HTML and assets.

### Evidence

**Nginx Origin** (CORRECT ✅):
```
/usr/share/nginx/html/assets/main-Chr9uN05.js EXISTS
/usr/share/nginx/html/index.html references: main-Chr9uN05.js
Container created: 10 minutes ago
Files match perfectly
```

**Cloudflare Edge** (STALE ❌):
```powershell
PS> curl -s https://app.ledger-mind.org/ | Select-String "main-.*\.js"
<script type="module" crossorigin src="/assets/main-DCJyg88Y.js"></script>
```

**Service Worker**: ✅ None found in codebase
**Docker Build**: ✅ Correct, files match
**Playwright Config**: ✅ Now disables SW with `--disable-service-worker`

## What You Need to Do (5 Minutes)

### Step 1: Purge Cloudflare Cache

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select domain: `ledger-mind.org`
3. Navigate to: **Caching** → **Configuration**
4. Click: **"Purge Everything"**
5. Confirm the purge

**Why**: This will clear the stale `main-DCJyg88Y.js` and old `index.html` from Cloudflare's edge.

### Step 2: Create Cache Rules (Prevents Future Issues)

#### Rule 1: Don't Cache HTML

1. Go to: **Rules** → **Cache Rules** → **Create rule**
2. **Rule name**: `No Cache HTML - app.ledger-mind.org`
3. **When incoming requests match**:
   ```
   (http.host eq "app.ledger-mind.org" and http.request.uri.path in {"/", "/index.html"})
   ```
4. **Then**:
   - **Cache status**: `Bypass`
   - **Edge Cache TTL**: `Respect origin` (or `0`)
5. Click **Deploy**

**Why**: Ensures every deploy gets fresh HTML with correct bundle hash.

#### Rule 2: Long Cache for Assets

1. **Create rule** (second rule)
2. **Rule name**: `Long Cache Assets - app.ledger-mind.org`
3. **When incoming requests match**:
   ```
   (http.host eq "app.ledger-mind.org" and starts_with(http.request.uri.path, "/assets/"))
   ```
4. **Then**:
   - **Cache status**: `Eligible for cache`
   - **Edge Cache TTL**: `1 month` (safe because hash-named)
   - **Browser Cache TTL**: `1 month`
5. Click **Deploy**

**Why**: Assets are hash-named (`main-Chr9uN05.js`), so same hash = same file. Can cache forever.

### Step 3: Verify Fix (From Your Dev Machine)

```powershell
# Should show main-Chr9uN05.js (not main-DCJyg88Y.js)
curl -s https://app.ledger-mind.org/ | Select-String "main-.*\.js"

# Should return 200 OK
curl -I https://app.ledger-mind.org/assets/main-Chr9uN05.js

# Should show cf-cache-status: BYPASS or DYNAMIC
curl -I https://app.ledger-mind.org/
```

### Step 4: Run Debug Test

```powershell
cd C:\ai-finance-agent-oss-clean\apps\web
$env:IS_PROD='true'
$env:PW_SKIP_WS='1'
$env:BASE_URL='https://app.ledger-mind.org'
pnpm exec playwright test tests/e2e/debug-chatdock-mount.spec.ts --project=chromium-prod --reporter=line
```

**Expected Console Logs** (GOOD ✅):
- ✅ `[ChatDock] ✅ MOUNTED` with location/build/timestamp
- ✅ `ChatDock DOM elements found: 1`
- ❌ NO `[App] chat mount effect` logs
- ❌ NO `[App] importing chat module...`
- ❌ NO `[chat] iframe created`

**If you see the OLD logs** (BAD ❌):
- `[App] chat mount effect`
- `[chat] iframe created`
- `main-DCJyg88Y.js` in error URLs

**Then**: Wait 1-2 minutes (CF purge propagation) and try again.

### Step 5: Run Full E2E Suite

Once debug test passes:

```powershell
pnpm exec playwright test tests/e2e/chat-launcher-anim.spec.ts --project=chromium-prod --reporter=line
```

Should pass with `lm-chat-launcher-root` visible.

## Success Criteria

- [ ] Cloudflare cache purged
- [ ] HTML bypass rule created
- [ ] Assets long-cache rule created
- [ ] `curl` shows `main-Chr9uN05.js` (not `main-DCJyg88Y.js`)
- [ ] Debug test shows `[ChatDock] ✅ MOUNTED`
- [ ] E2E tests pass

## Troubleshooting

**If purge doesn't work immediately**:
- Wait 1-2 minutes for global propagation
- Try adding `?v=123` query param: `https://app.ledger-mind.org/?v=123`
- Check if your browser has local cache (Ctrl+Shift+R hard refresh)

**If still seeing old bundle**:
- Verify rules are deployed (Rules tab should show them active)
- Check rule order (HTML bypass should be before assets cache)
- Try purging by URL: purge `/`, `/index.html`, `/assets/main-DCJyg88Y.js`

## Why This Happened

1. Cloudflare cached `index.html` with bundle reference `main-DCJyg88Y.js`
2. We rebuilt, creating new bundle `main-Chr9uN05.js`
3. Origin updated, but CF kept serving cached HTML
4. Tests loaded old bundle from cache (which still existed in CF edge)
5. Old bundle had old code (`ensureChatMounted` iframe logic)
6. ChatDock never mounted because conditions changed

## Why This Won't Happen Again

With cache rules in place:
- HTML is **never cached** → Always gets fresh bundle hash
- Assets are **cached forever** → Fast, but hash change = new file
- No manual purges needed → Deploy just works™

## Files Updated

- ✅ `playwright.config.ts`: Added `--disable-service-worker` for prod
- ✅ `CLOUDFLARE_CACHE_FIX.md`: This document
- ✅ `CACHE_INVESTIGATION_RESULTS.md`: Full investigation log

---

**Next**: Execute Steps 1-5 above, then ping me with the debug test results! 🚀
