# Immediate Development Options (While GPU Quota Pending)

## 📊 Current Status

**GPU Quota Request:** ⏳ PENDING (submitted 6:52 PM EST)
**Request ID:** 934bcaffd899444ea14720802907d2d8ZffZlCPY
**ETA:** 15 mins - 2 hours (typically auto-approved)

**Active Cluster:**

- ✅ t3.micro CPU node (Free Tier) - RUNNING
- ⏸️ g5.xlarge GPU node - BLOCKED (waiting for quota)

## 🚀 What You Can Do RIGHT NOW

### Option 1: Run Full Stack Locally (RECOMMENDED) ⚡

This gives you 100% hackathon functionality while waiting for AWS approval.

#### 1A. Start Backend Locally

```powershell
cd C:\ai-finance-agent-oss-clean\apps\backend

# Configure for local Ollama (CPU-based, instant)
$env:DEFAULT_LLM_PROVIDER="ollama"
$env:OLLAMA_BASE_URL="http://localhost:11434"
$env:EMBED_PROVIDER="ollama"
$env:EMBED_MODEL="nomic-embed-text"

# Start backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Test endpoint:

```powershell
curl http://localhost:8000/healthz
curl http://localhost:8000/agent/actions  # requires auth
```

#### 1B. Pull Ollama Models (CPU-friendly)

```powershell
# Install Ollama (if not already): https://ollama.com/download
ollama pull llama3.2:latest  # Fast 3B model
ollama pull nomic-embed-text  # Embedding model
```

Then reconfigure backend:

```powershell
$env:OLLAMA_MODEL="llama3.2"
$env:EMBED_MODEL="nomic-embed-text"
```

#### 1C. Start Frontend

```powershell
cd C:\ai-finance-agent-oss-clean\apps\web

# Install deps (if needed)
pnpm install

# Start dev server
pnpm dev
```

Access: http://localhost:5173

### Option 2: Test Backend on EKS (Without NIM) 🐳

Deploy your backend to the t3.micro node using Ollama-compatible config:

```powershell
# Build backend image
cd C:\ai-finance-agent-oss-clean\apps\backend
docker build -t ledgermind-backend:latest .

# Create ECR repo (if needed)
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$Env:AWS_PROFILE="lm-admin"
aws ecr create-repository --repository-name ledgermind-backend --region us-west-2

# Tag and push
$ECR_URL = (aws ecr describe-repositories --repository-names ledgermind-backend --query "repositories[0].repositoryUri" --output text)
docker tag ledgermind-backend:latest ${ECR_URL}:latest

# Login to ECR
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin $ECR_URL

# Push
docker push ${ECR_URL}:latest
```

Then deploy with Ollama config:

```yaml
# Create backend-dev.yaml (CPU-only version)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: <ECR_URL>:latest
          env:
            - name: DEFAULT_LLM_PROVIDER
              value: "ollama"
            - name: OLLAMA_BASE_URL
              value: "http://host.docker.internal:11434" # Or deploy Ollama to EKS
            - name: EMBED_PROVIDER
              value: "ollama"
          resources:
            limits:
              memory: 1Gi
            requests:
              cpu: "500m"
              memory: 512Mi
```

### Option 3: Prepare Demo Materials 📹

While code runs locally, create hackathon submission assets:

#### 3A. Architecture Diagram

Create visual showing:

- Frontend (React) → Backend (FastAPI) → NIM LLM/Embed
- PostgreSQL + pgvector for RAG
- EKS deployment architecture
- Data flow for financial queries

Tools: draw.io, Excalidraw, Mermaid

#### 3B. Demo Script Polish

Edit `hackathon/demo-script.md`:

- Add specific example queries
- Include expected responses
- Note timing for 3-minute video

#### 3C. GitHub README

Update root README.md with:

- "AWS × NVIDIA Hackathon Submission" badge
- Quick start instructions
- Architecture overview
- Demo video link (placeholder)

#### 3D. Environment Documentation

Document the NIM integration:

```markdown
## NVIDIA NIM Integration

### LLM Service

- **Model**: meta/llama-3.1-nemotron-nano-8B-v1
- **Hardware**: g5.xlarge (NVIDIA A10G, 24GB VRAM)
- **Endpoint**: `/v1/chat/completions` (OpenAI-compatible)
- **Features**: RAG-optimized, low latency, cost-efficient

### Embedding Service

- **Model**: nvidia/nv-embed-v2
- **Output**: 768-dimensional vectors
- **Hardware**: CPU-optimized fallback available
- **Use Case**: Financial document semantic search

### Code Examples

[Include snippets from nim_llm.py, nim_embed.py]
```

### Option 4: Record Demo Video Prep 🎥

Set up recording environment:

1. **Browser tabs**:

   - Frontend: http://localhost:5173
   - Backend health: http://localhost:8000/docs
   - AWS Console: EKS cluster view (for showing deployment)
   - GitHub repo

2. **Screen recording tool**:

   - OBS Studio (free): https://obsproject.com
   - Xbox Game Bar (Windows built-in): Win+G
   - Loom (easy sharing): https://loom.com

3. **Demo data**:

   - Seed database with sample transactions
   - Pre-create interesting financial scenarios
   - Prepare 2-3 queries to show off RAG + agent actions

4. **Script walkthrough**:
   - 0:00-0:30 - Hook: "AI finance agent with NVIDIA NIM"
   - 0:30-1:00 - Show frontend, query example
   - 1:00-1:30 - Explain RAG retrieval with NIM embeddings
   - 1:30-2:00 - Show agent actions (budget alerts, anomalies)
   - 2:00-2:30 - Quick code tour (nim_llm.py, K8s YAML)
   - 2:30-3:00 - EKS deployment, closing remarks

## 🔔 When GPU Quota is Approved

You'll receive **email notification**. Then run:

```powershell
# Verify quota increased
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$Env:AWS_PROFILE="lm-admin"
aws service-quotas get-service-quota --service-code ec2 --quota-code L-DB2E81BA --query "Quota.Value"

# Check if GPU node auto-joined
kubectl get nodes -o wide

# If not, manually trigger scale
eksctl scale nodegroup --cluster ledgermind-gpu --name gpu-workers-paid --nodes 1

# Wait for NIM pods to become Ready (~10 min for model downloads)
kubectl get pods -n nim -w

# Port-forward for testing
kubectl port-forward -n nim svc/nim-llm-svc 8008:8000
kubectl port-forward -n nim svc/nim-embed-svc 8081:8000

# Test NIM LLM
curl http://localhost:8008/v1/models
curl -X POST http://localhost:8008/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"meta/llama-3.1-nemotron-nano-8B-v1","messages":[{"role":"user","content":"Explain compound interest"}],"max_tokens":100}'

# Update backend to use EKS NIM endpoints
$env:NIM_LLM_URL="http://localhost:8008"
$env:NIM_EMBED_URL="http://localhost:8081"
$env:DEFAULT_LLM_PROVIDER="nim"
$env:EMBED_PROVIDER="nim"

# Restart backend and re-record demo with real GPU-accelerated NIM!
```

## ⏱️ Quota Approval Monitoring

Check status every 15 minutes:

```powershell
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$Env:AWS_PROFILE="lm-admin"
$Env:AWS_REGION="us-west-2"

aws service-quotas get-requested-service-quota-change `
  --request-id 934bcaffd899444ea14720802907d2d8ZffZlCPY `
  --query "RequestedQuota.{Status:Status,Updated:LastUpdated}" `
  --output table
```

Possible statuses:

- **PENDING**: Still waiting (normal for first 15-120 min)
- **APPROVED**: ✅ Ready to deploy!
- **DENIED**: Contact AWS Support with hackathon context

## 💰 Cost Tracking

### Current: $0/hour

- t3.micro: Free Tier
- EKS control plane: Free Tier (first 750 hours)

### After GPU launches: ~$1.01/hour

- Budget $2-3 for 2-hour demo recording
- Scale to 0 immediately after: `eksctl scale nodegroup --cluster ledgermind-gpu --name gpu-workers-paid --nodes 0`

### Cleanup when done:

```powershell
eksctl delete cluster --name ledgermind-gpu --region us-west-2
```

## 📋 Pre-Flight Checklist (for when GPU is ready)

- [ ] NGC API key in `k8s/secrets.yaml`
- [ ] NVIDIA device plugin installed
- [ ] NIM deployments applied (`k8s/nim-services.yaml`)
- [ ] Backend config has NIM URLs
- [ ] Database seeded with demo data
- [ ] Demo script reviewed
- [ ] Screen recording software tested
- [ ] Browser tabs prepared
- [ ] GitHub README updated
- [ ] License file added (MIT recommended)

## 🎯 Hackathon Submission Requirements

✅ **Must-haves** (all ready or in progress):

- [x] NVIDIA NIM LLM integration (code ready, waiting for GPU)
- [x] NVIDIA NIM Embeddings (code ready)
- [x] RAG implementation (pgvector working)
- [x] EKS deployment (cluster active, GPU nodegroup pending quota)
- [x] One-command deploy script (`deploy.ps1` created)
- [ ] 3-minute demo video (prep done, record when GPU live)
- [ ] GitHub repo with README (update with demo link)
- [ ] Open source license (add MIT License)

See `GPU_QUOTA_STATUS.md` for full deployment status and `HACKATHON_AUDIT.md` for requirements checklist.

---

**Bottom line:** Use local Ollama setup NOW to develop/test. When GPU quota approves (1-2 hours), swap to NIM endpoints and re-record demo. You're 95% ready! 🚀
