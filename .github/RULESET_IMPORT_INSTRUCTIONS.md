# GitHub Repository Rulesets - Import Instructions

## Quick Import (Recommended)

Unfortunately, GitHub does not support direct JSON import for rulesets via the UI. You must create them manually or use the GitHub API.

## Option 1: Manual Creation (5 minutes)

### Ruleset 1: Block GCP Service Account Keys

1. Navigate to: https://github.com/leok974/ai-finance-agent-oss/settings/rules/new?target=branch&enforcement=active
2. **Name**: `Block GCP Service Account Keys`
3. **Target branches**: All branches (default)
4. **Add rule**: "Restrict file paths"
5. **Add these patterns** (one per line):
   ```
   .*service[-_ ]?account.*\.json
   .*gcp.*key.*\.json
   .*[-_]sa\.json
   gcp-dbt-sa\.json
   .*credentials.*\.json
   .*-key\.json
   .*serviceaccount.*\.json
   ```
6. Click "Create"

### Ruleset 2: Security Review Required

1. Navigate to: https://github.com/leok974/ai-finance-agent-oss/settings/rules/new?target=branch&enforcement=active
2. **Name**: `Security Review Required`
3. **Target branches**: Add `main` and `production`
4. **Add rule**: "Require a pull request before merging"
   - Required approvals: 1
   - Dismiss stale reviews: ✅
   - Require review from Code Owners: ✅
   - Require approval of most recent push: ❌
   - Require conversation resolution: ✅
5. **Add rule**: "Require status checks to pass"
   - Add status check: `pre-commit`
   - Require branches to be up to date: ✅
6. Click "Create"

---

## Option 2: GitHub API (Automated)

Use the GitHub REST API to create rulesets programmatically:

### Prerequisites
```bash
# Install GitHub CLI if not already installed
gh auth status
```

### Create Ruleset 1: Block Service Account Keys
```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/leok974/ai-finance-agent-oss/rulesets \
  --input .github/rulesets/block-service-account-keys.json
```

### Create Ruleset 2: Security Review Required
```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/leok974/ai-finance-agent-oss/rulesets \
  --input .github/rulesets/security-review-required.json
```

---

## Option 3: PowerShell Script (Windows)

```powershell
# Get GitHub token
$token = gh auth token

# Create Ruleset 1
$headers = @{
    "Accept" = "application/vnd.github+json"
    "Authorization" = "Bearer $token"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$body1 = Get-Content .github/rulesets/block-service-account-keys.json -Raw
Invoke-RestMethod -Method POST -Uri "https://api.github.com/repos/leok974/ai-finance-agent-oss/rulesets" -Headers $headers -Body $body1 -ContentType "application/json"

# Create Ruleset 2
$body2 = Get-Content .github/rulesets/security-review-required.json -Raw
Invoke-RestMethod -Method POST -Uri "https://api.github.com/repos/leok974/ai-finance-agent-oss/rulesets" -Headers $headers -Body $body2 -ContentType "application/json"
```

---

## Verification

After creating rulesets:

1. **Check rulesets page**: https://github.com/leok974/ai-finance-agent-oss/settings/rules
2. **Test file path blocking**:
   ```bash
   # Try to commit a fake service account file
   echo '{"type":"service_account"}' > test-sa.json
   git add test-sa.json
   git commit -m "test"
   # Should be blocked by pre-commit hook

   # Try to push (if you bypass pre-commit)
   git commit -m "test" --no-verify
   git push origin test-branch
   # Should be blocked by GitHub ruleset
   ```

3. **Verify status**:
   ```bash
   gh api /repos/leok974/ai-finance-agent-oss/rulesets | jq '.[] | {id, name, enforcement}'
   ```

---

## Troubleshooting

### Issue: API returns 404
- Ensure you have admin permissions on the repository
- Check: `gh auth status` shows correct account

### Issue: Ruleset not blocking files
- Verify enforcement is set to "active" (not "evaluate")
- Check pattern syntax (must be valid regex)
- Wait 1-2 minutes for ruleset to propagate

### Issue: Can't create via API
- Use Manual Creation (Option 1) as fallback
- Verify token has `repo` scope: `gh auth refresh -s repo`

---

## References

- GitHub Rulesets API: https://docs.github.com/en/rest/repos/rules
- Rulesets Documentation: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
