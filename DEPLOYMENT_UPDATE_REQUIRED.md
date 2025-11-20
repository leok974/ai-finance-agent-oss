# 🚀 Production Update Required - Deploy Latest Changes

> **⚠️ OUTDATED:** This document describes a Kubernetes/EKS-based deployment.
> **LedgerMind no longer uses Kubernetes in production.** See [DEPLOY.md](./DEPLOY.md) for current Docker Compose deployment instructions.

**Status:** Local code has critical changes NOT yet deployed to EKS (HISTORICAL)
**Impact:** Backend pod running OLD code without pgvector, NIM providers, and RAG endpoints (HISTORICAL)
**Action Required:** See DEPLOY.md for current deployment process

---

## 📋 What Needs to Be Deployed

### ✅ Already in Local Code (NOT in EKS yet)

1. **pgvector RAG Models** (`orm_models.py`)

   - `RagDocument` table
   - `RagChunk` table with vector(768) column
   - Conditional pgvector import for Postgres/SQLite compatibility

2. **pgvector Dependency** (`requirements.txt`)

   - `pgvector==0.2.*` added

3. **NVIDIA NIM Providers** (NEW files - untracked)

   - `app/providers/nim_llm.py` (95 lines)
   - `app/providers/nim_embed.py` (45 lines)

4. **RAG Router** (NEW file - untracked)

   - `app/routers/rag.py` with `/agent/rag/ingest`, `/agent/rag/query`, `/agent/explain/card/{id}`

5. **Agent Actions Router** (NEW file - untracked)

   - `app/routers/agent_actions.py` with `/agent/actions` endpoint

6. **Service Layer Changes**

   - `app/services/llm.py` - Added `get_llm_client()` factory
   - `app/services/embed_provider.py` - NIM routing logic (NEW file - untracked)
   - `app/services/rag_store.py` - Vector store operations (NEW file - untracked)

7. **Config Changes**

   - `app/config.py` - Added NIM\_\* environment variables

8. **Main App Changes**
   - `app/main.py` - Registered new routers (rag, agent_actions)

### ⚠️ Files NOT Tracked in Git Yet

```
apps/backend/app/providers/
apps/backend/app/routers/agent_actions.py
apps/backend/app/routers/rag.py
apps/backend/app/services/embed_provider.py
apps/backend/app/services/rag_store.py
apps/backend/app/services/rag_chunk.py
apps/backend/app/services/rag_tools.py
apps/backend/alembic/versions/20251005_rag_pgvector.py
```

---

## 🔧 Quick Deployment (15 minutes)

### Step 1: Add New Files to Git

```powershell
cd C:\ai-finance-agent-oss-clean

# Add NIM providers
git add apps/backend/app/providers/

# Add RAG and agent routers
git add apps/backend/app/routers/agent_actions.py
git add apps/backend/app/routers/rag.py

# Add RAG services
git add apps/backend/app/services/embed_provider.py
git add apps/backend/app/services/rag_store.py
git add apps/backend/app/services/rag_chunk.py
git add apps/backend/app/services/rag_tools.py

# Add RAG migration
git add apps/backend/alembic/versions/20251005_rag_pgvector.py

# Check status
git status | Select-String "new file|modified" | Select-Object -First 20
```

### Step 2: Commit Changes

```powershell
git commit -m "feat: add NVIDIA NIM integration + pgvector RAG

- Add NVIDIA NIM LLM provider (meta/llama-3.1-8b-instruct)
- Add NVIDIA NIM embedding provider (nv-embedqa-e5-v5)
- Add RAG models with pgvector support
- Add RAG ingest/query endpoints
- Add agent actions endpoint for proactive recommendations
- Add alembic migration for RAG tables
- Update requirements.txt with pgvector dependency

For AWS × NVIDIA Hackathon submission"
```

### Step 3: Rebuild Docker Image

```powershell
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$env:AWS_PROFILE="lm-admin"
$REGION="us-west-2"
$ACCOUNT_ID="103102677735"

# Login to ECR
aws ecr get-login-password --region $REGION | `
  docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Rebuild with latest code
cd C:\ai-finance-agent-oss-clean
docker build -t ledgermind:v2 -f apps/backend/Dockerfile apps/backend

# Tag for ECR
docker tag ledgermind:v2 "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/ledgermind:v2"
docker tag ledgermind:v2 "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/ledgermind:latest"

# Push to ECR
docker push "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/ledgermind:v2"
docker push "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/ledgermind:latest"
```

### Step 4: Update K8s Deployment

```powershell
# Option A: Update image tag (recommended)
kubectl set image deployment/lm-backend -n lm `
  api="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/ledgermind:v2"

# Option B: Rollout restart (if using :latest tag)
kubectl -n lm rollout restart deploy/lm-backend

# Watch rollout
kubectl -n lm rollout status deploy/lm-backend

# Verify new pod
kubectl -n lm get pods -o wide
```

### Step 5: Verify Deployment

```powershell
# Wait for pod to be ready
kubectl wait --for=condition=ready pod -l app=lm-backend -n lm --timeout=120s

# Check pod is using new image
kubectl get pod -n lm -l app=lm-backend -o jsonpath='{.items[0].spec.containers[0].image}'
# Should show: 103102677735.dkr.ecr.us-west-2.amazonaws.com/ledgermind:v2

# Port-forward and test
kubectl -n lm port-forward svc/lm-backend-svc 8080:80 &
Start-Sleep 3

# Test health
curl http://localhost:8080/healthz | ConvertFrom-Json

# Test new RAG endpoint exists
curl -X POST http://localhost:8080/agent/rag/ingest `
  -H "Content-Type: application/json" `
  -d '{"documents": [{"title": "Test", "content": "Testing RAG", "source_url": "test://1"}]}'

# Test agent actions endpoint
curl http://localhost:8080/agent/actions
# (Will return 401 without auth, but 401 means endpoint exists!)

# Stop port-forward
Get-Job | Where-Object {$_.Command -like "*port-forward*"} | Stop-Job | Remove-Job
```

---

## 🎯 Verify Critical Components

### Check 1: pgvector Dependency Installed

```powershell
kubectl exec -n lm deployment/lm-backend -- pip list | Select-String pgvector
# Should show: pgvector        0.2.x
```

### Check 2: NIM Providers Available

```powershell
kubectl exec -n lm deployment/lm-backend -- ls -la app/providers/
# Should show: nim_llm.py, nim_embed.py
```

### Check 3: RAG Router Registered

```powershell
kubectl exec -n lm deployment/lm-backend -- python -c "
from app.main import app
routes = [r.path for r in app.routes if 'rag' in r.path]
print('RAG routes:', routes)
"
# Should show: /agent/rag/ingest, /agent/rag/query, /agent/explain/card/{card_id}
```

### Check 4: NIM Config Present

```powershell
kubectl exec -n lm deployment/lm-backend -- env | Select-String NIM
# Should show all NIM_* variables
```

---

## ⚠️ Why This Is Critical for Demo

### Current State (OLD image)

- ❌ No pgvector models
- ❌ No NVIDIA NIM providers
- ❌ No `/agent/rag/*` endpoints
- ❌ No `/agent/actions` endpoint
- ❌ Frontend 404 errors on all agent tool calls
- ❌ Can't demonstrate RAG capabilities
- ❌ Can't show NIM integration working

### After Deployment (NEW image)

- ✅ pgvector models available
- ✅ NVIDIA NIM LLM functional
- ✅ NVIDIA NIM embeddings functional
- ✅ RAG ingest/query working
- ✅ Agent actions working
- ✅ Frontend can call agent endpoints
- ✅ Full demo capabilities

---

## 📊 Image Size Comparison

### Old Image (demo tag)

```
SIZE: 228 MB
LAYERS: 12
PYTHON PACKAGES: ~50
```

### New Image (v2 tag - with pgvector + NIM)

```
SIZE: ~235 MB (estimated, +7 MB for pgvector)
LAYERS: 13 (+1 for new dependencies)
PYTHON PACKAGES: ~52 (+pgvector, +openai SDK)
```

---

## 🔍 Troubleshooting

### Issue: Docker build fails with pgvector error

**Cause:** pgvector requires PostgreSQL dev headers

**Fix:** Already handled in Dockerfile with `python:3.11-slim` base (includes gcc, postgresql-dev)

### Issue: Pod CrashLoopBackOff after update

**Check logs:**

```powershell
kubectl logs -n lm -l app=lm-backend --tail=100
```

**Common causes:**

1. Import error (missing dependency)
2. Config error (missing NIM_API_KEY)
3. Database migration needed

**Fix:**

```powershell
# Run migrations
kubectl exec -n lm deployment/lm-backend -- python -m alembic upgrade head

# Or rollback to old image
kubectl set image deployment/lm-backend -n lm `
  api="103102677735.dkr.ecr.us-west-2.amazonaws.com/ledgermind:demo"
```

### Issue: /agent/rag endpoints return 404

**Cause:** Router not registered in main.py

**Check:**

```powershell
kubectl logs -n lm -l app=lm-backend | Select-String "rag_router"
```

**Fix:** Ensure `main.py` has:

```python
from app.routers import rag as rag_router
app.include_router(rag_router.router)
```

### Issue: NIM embeddings fail with "pgvector not found"

**Cause:** pgvector package missing

**Verify:**

```powershell
kubectl exec -n lm deployment/lm-backend -- python -c "import pgvector; print('OK')"
```

**Fix:** Rebuild image ensuring `pgvector==0.2.*` is in requirements.txt

---

## ✅ Quick Checklist Before Demo

- [ ] New image built with `docker build`
- [ ] Image pushed to ECR with `:v2` tag
- [ ] Deployment updated to use `:v2` image
- [ ] Pod running with new image (check `kubectl get pod -o jsonpath`)
- [ ] Health endpoint responding (curl /healthz)
- [ ] pgvector installed (pip list | grep pgvector)
- [ ] NIM providers present (ls app/providers/)
- [ ] RAG endpoints registered (curl /agent/rag/query returns 422, not 404)
- [ ] Agent actions endpoint exists (curl /agent/actions returns 401, not 404)
- [ ] NIM config verified (env | grep NIM)

---

## 🎬 For Demo Recording

### Option 1: Update Now (15 min) - RECOMMENDED

- Deploy new image with all features
- Record demo showing working RAG + NIM
- Show frontend calling agent endpoints successfully
- Full "production deployment" story

### Option 2: Record with Old Image (explain limitations)

- Show pod running (healthz degraded is OK)
- Show code (nim_llm.py, rag.py) in VS Code
- Explain "these features are code-complete, awaiting deployment"
- Show K8s manifests ready to deploy
- Less impressive, but honest

### Option 3: Hybrid (10 min update + record)

- Quick rebuild + push (skip commits for now)
- Restart pod with new image
- Record with working features
- Commit to git later

---

## 🚨 CRITICAL: Deploy Before Recording

The frontend at app.ledger-mind.org is currently throwing 404 errors because it's calling endpoints that DON'T EXIST in the deployed backend.

**Frontend expects:**

- `POST /api/agent/tools/charts/summary`
- `POST /api/agent/tools/meta/latest_month`
- `POST /api/agent/tools/suggestions`
- `GET /api/agent/tools/charts/merchants`

**Backend currently has (OLD image):**

- Basic health, transactions, budget endpoints
- NO agent tools
- NO RAG endpoints
- NO NIM integration

**You MUST rebuild and deploy to have a working demo!**

---

## ⏱️ Time Estimate

| Task              | Time       |
| ----------------- | ---------- |
| Git add new files | 2 min      |
| Git commit        | 1 min      |
| Docker build      | 3 min      |
| Docker push       | 5 min      |
| kubectl set image | 30 sec     |
| Wait for rollout  | 2 min      |
| Verification      | 2 min      |
| **Total**         | **15 min** |

---

**Status:** ⚠️ DEPLOYMENT REQUIRED - Local code has critical features not in EKS
**Recommendation:** Deploy now (15 min) before recording demo
**Alternative:** Record with current pod, explain "features implemented, pending deployment"
