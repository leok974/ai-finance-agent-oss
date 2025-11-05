# 🗄️ Database Setup for EKS Deployment

**Issue:** Backend pod has no persistent database - using ephemeral SQLite that disappears on pod restart.

**Solution:** Two options - Quick (SQLite with volume) or Production (PostgreSQL + pgvector)

---

## 🚀 Quick Fix: SQLite with Persistent Volume (5 min)

### 1. Create PersistentVolumeClaim

```yaml
# k8s/lm-sqlite-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: lm-sqlite-data
  namespace: lm
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp2
  resources:
    requests:
      storage: 1Gi
```

### 2. Update Deployment to Use Volume

```powershell
# Add to k8s/lm-hosted-nim.yaml deployment spec
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$env:AWS_PROFILE="lm-admin"

kubectl patch deployment lm-backend -n lm --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/volumes",
    "value": [{"name": "sqlite-data", "persistentVolumeClaim": {"claimName": "lm-sqlite-data"}}]
  },
  {
    "op": "add",
    "path": "/spec/template/spec/containers/0/volumeMounts",
    "value": [{"name": "sqlite-data", "mountPath": "/data"}]
  },
  {
    "op": "add",
    "path": "/spec/template/spec/containers/0/env/-",
    "value": {"name": "DATABASE_URL", "value": "sqlite:////data/dev.sqlite3"}
  }
]'
```

### 3. Initialize Database

```powershell
# Wait for pod to restart
kubectl -n lm rollout status deploy/lm-backend

# Run migrations
kubectl exec -n lm deployment/lm-backend -- alembic upgrade head

# Verify
kubectl exec -n lm deployment/lm-backend -- ls -la /data
```

---

## 🏆 Production Fix: PostgreSQL + pgvector (15 min)

### 1. Deploy PostgreSQL StatefulSet

```powershell
# Apply the pgvector manifest
kubectl apply -f k8s/postgres-pgvector.yaml

# Wait for postgres to be ready
kubectl -n lm rollout status statefulset/postgres

# Check logs
kubectl logs -n lm postgres-0 --tail=20
```

### 2. Initialize pgvector Extension

```powershell
# Connect to postgres pod
kubectl exec -it -n lm postgres-0 -- psql -U postgres

# In psql prompt:
CREATE DATABASE ledgermind;
\c ledgermind
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
\q
```

### 3. Update Backend to Use PostgreSQL

```powershell
# Update environment variable
kubectl set env deployment/lm-backend -n lm \
  DATABASE_URL="postgresql+psycopg://postgres:postgres@postgres:5432/ledgermind"

# Wait for rollout
kubectl -n lm rollout status deploy/lm-backend

# Run migrations
kubectl exec -n lm deployment/lm-backend -- alembic upgrade head
```

### 4. Verify RAG Tables

```powershell
kubectl exec -it -n lm postgres-0 -- psql -U postgres -d ledgermind -c "\dt rag*"

# Should show:
#              List of relations
#  Schema |     Name      | Type  |  Owner
# --------+---------------+-------+----------
#  public | rag_chunks    | table | postgres
#  public | rag_documents | table | postgres
```

---

## 📊 RAG Database Initialization

### 1. Create RAG Tables (if not in alembic)

```sql
-- rag_documents table
CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    source_url TEXT,
    content_type VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- rag_chunks table with pgvector
CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),  -- nv-embedqa-e5-v5 produces 768-dim vectors
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, chunk_index)
);

-- HNSW index for fast vector search
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
ON rag_chunks
USING hnsw (embedding vector_l2_ops)
WITH (m = 16, ef_construction = 64);

-- B-tree indexes for common queries
CREATE INDEX IF NOT EXISTS rag_chunks_document_id_idx
ON rag_chunks(document_id);

CREATE INDEX IF NOT EXISTS rag_documents_created_at_idx
ON rag_documents(created_at DESC);
```

### 2. Ingest Sample Financial Documents

```powershell
# Port-forward to backend
kubectl -n lm port-forward svc/lm-backend-svc 8080:80

# In new terminal, ingest sample docs
curl -X POST http://localhost:8080/agent/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "title": "Credit Card Rewards Guide",
        "content": "Credit card rewards programs offer cash back, points, or miles. Cash back cards typically return 1-5% on purchases. Travel cards offer points redeemable for flights and hotels. Compare annual fees vs rewards value.",
        "source_url": "internal://guides/credit-cards"
      },
      {
        "title": "Budget Categories Best Practices",
        "content": "Common budget categories include Housing (25-30%), Transportation (15-20%), Food (10-15%), Utilities (5-10%), Savings (10-20%), and Entertainment (5-10%). Adjust percentages based on income and location.",
        "source_url": "internal://guides/budgeting"
      },
      {
        "title": "Understanding Credit Scores",
        "content": "Credit scores range from 300-850. Factors: payment history (35%), credit utilization (30%), length of history (15%), new credit (10%), credit mix (10%). Pay on time, keep utilization below 30%, and avoid closing old accounts.",
        "source_url": "internal://guides/credit-score"
      }
    ]
  }'

# Check ingestion
curl http://localhost:8080/agent/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "How do credit card rewards work?", "top_k": 3}'
```

### 3. Test RAG Endpoints

```powershell
# Test explain_card endpoint (requires card_id)
curl http://localhost:8080/agent/explain/card/test-card-123

# Expected response:
# {
#   "explanation": "...",
#   "sources": [...],
#   "next_actions": [...]
# }
```

---

## 🔍 Debugging RAG Issues

### Check Backend Logs

```powershell
kubectl logs -n lm -l app=lm-backend --tail=100 | Select-String -Pattern "rag|embed|nim"
```

### Check Database Connectivity

```powershell
kubectl exec -n lm deployment/lm-backend -- python -c "
from app.database import SessionLocal
from sqlalchemy import text
db = SessionLocal()
result = db.execute(text('SELECT 1')).scalar()
print(f'DB connection: OK (result={result})')
"
```

### Check pgvector Extension

```powershell
kubectl exec -it -n lm postgres-0 -- psql -U postgres -d ledgermind -c "
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
"
```

### Check RAG Tables Schema

```powershell
kubectl exec -it -n lm postgres-0 -- psql -U postgres -d ledgermind -c "
\d rag_chunks
"
```

### Manual Vector Search Test

```powershell
kubectl exec -it -n lm postgres-0 -- psql -U postgres -d ledgermind -c "
SELECT id, chunk_index, LEFT(content, 50) as preview
FROM rag_chunks
WHERE embedding IS NOT NULL
LIMIT 5;
"
```

---

## 🚨 Common Issues & Fixes

### Issue 1: "alembic_out_of_sync" in healthz

**Cause:** Database migrations not run.

**Fix:**

```powershell
kubectl exec -n lm deployment/lm-backend -- alembic upgrade head
```

### Issue 2: "table rag_documents does not exist"

**Cause:** Migrations missing RAG tables.

**Fix:** Run SQL from "RAG Database Initialization" section above, or create migration:

```powershell
kubectl exec -n lm deployment/lm-backend -- alembic revision --autogenerate -m "add_rag_tables"
kubectl exec -n lm deployment/lm-backend -- alembic upgrade head
```

### Issue 3: "relation 'rag_chunks_embedding_idx' does not exist"

**Cause:** pgvector extension not installed or index not created.

**Fix:**

```powershell
kubectl exec -it -n lm postgres-0 -- psql -U postgres -d ledgermind -c "
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
ON rag_chunks USING hnsw (embedding vector_l2_ops);
"
```

### Issue 4: NIM embeddings failing with 401/403

**Cause:** NGC API key invalid or missing.

**Fix:**

```powershell
# Check secret
kubectl get secret nim-credentials -n lm -o jsonpath='{.data.NGC_API_KEY}' | base64 -d

# If wrong, recreate:
kubectl delete secret nim-credentials -n lm
kubectl create secret generic nim-credentials -n lm \
  --from-literal=NGC_API_KEY=<your-ngc-key>

# Restart deployment
kubectl -n lm rollout restart deploy/lm-backend
```

### Issue 5: SQLite "database is locked"

**Cause:** Multiple pods trying to access same SQLite file, or WAL mode not enabled.

**Fix:** Use PostgreSQL (see Production Fix above) OR ensure only 1 replica:

```powershell
kubectl -n lm scale deploy/lm-backend --replicas=1
```

---

## 📈 Verify Everything Works

### Final Health Check

```powershell
kubectl -n lm port-forward svc/lm-backend-svc 8080:80

# In new terminal:
curl http://localhost:8080/healthz | ConvertFrom-Json | ConvertTo-Json -Depth 5

# Should show:
# {
#   "ok": true,
#   "status": "healthy",
#   "db": {"reachable": true, "models_ok": true},
#   "alembic": {"in_sync": true},
#   "crypto_ready": false  # OK for demo
# }
```

### Test RAG Pipeline End-to-End

```powershell
# 1. Ingest test document
$response = curl -X POST http://localhost:8080/agent/rag/ingest `
  -H "Content-Type: application/json" `
  -d '{"documents": [{"title": "Test", "content": "Budget tracking helps you save money.", "source_url": "test://1"}]}' `
  | ConvertFrom-Json

Write-Host "Ingested: $($response.document_ids.Count) documents"

# 2. Query RAG
$query = curl -X POST http://localhost:8080/agent/rag/query `
  -H "Content-Type: application/json" `
  -d '{"query": "How can I save money?", "top_k": 3}' `
  | ConvertFrom-Json

Write-Host "Found: $($query.results.Count) results"
Write-Host "Top result: $($query.results[0].content.Substring(0, 50))..."

# 3. Test agent actions
$actions = curl http://localhost:8080/agent/actions | ConvertFrom-Json
Write-Host "Agent actions: $($actions.actions.Count) recommendations"
```

---

## 🎬 For Demo Recording

### Option A: Skip Database Setup (fastest)

```powershell
# Just show:
# 1. kubectl get pods (Running status)
# 2. curl /healthz (degraded is OK, explain pending migrations)
# 3. Show NIM config with kubectl exec
# 4. Show code (nim_llm.py, k8s manifests)
# 5. Mention "DB ready for production with PostgreSQL+pgvector"
```

### Option B: Quick SQLite Setup (5 min)

```powershell
# 1. Run migrations
kubectl exec -n lm deployment/lm-backend -- alembic upgrade head

# 2. Restart pod
kubectl -n lm rollout restart deploy/lm-backend

# 3. Verify healthz shows ok:true
# 4. Ingest 1-2 sample docs
# 5. Test RAG query
# 6. Record demo showing working RAG
```

### Option C: Full PostgreSQL Setup (15 min)

```powershell
# Follow "Production Fix" steps above
# Record demo showing:
# - PostgreSQL StatefulSet running
# - pgvector extension installed
# - RAG tables with HNSW indexes
# - Working semantic search with NIM embeddings
```

---

## ✅ Recommended: Quick SQLite for Demo

**Why:** Fastest path to working demo (5 min), persistent storage, no additional infrastructure.

**Steps:**

1. Run migrations: `kubectl exec -n lm deployment/lm-backend -- alembic upgrade head`
2. Restart: `kubectl -n lm rollout restart deploy/lm-backend`
3. Verify: `curl http://localhost:8080/healthz`
4. Record demo with clean healthz status

**For submission:** Mention "PostgreSQL+pgvector ready for production" and show k8s/postgres-pgvector.yaml manifest.

---

**Status:** Database not initialized (SQLite ephemeral, no persistence)
**Impact:** Backend degraded, RAG not functional, data lost on pod restart
**Solution:** Run migrations (5 min) or deploy PostgreSQL (15 min)
**For demo:** Either works - migrations are fastest!
