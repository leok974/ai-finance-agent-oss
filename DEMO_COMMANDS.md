# 🎬 DEMO RECORDING - Command Cheat Sheet

**Preparation:** Open 2 terminal windows side-by-side

---

## Terminal 1: Infrastructure & Status

```powershell
# Setup
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$env:AWS_PROFILE = "lm-admin"
$env:AWS_REGION = "us-west-2"

# Show cluster nodes (CPU-only, no GPUs)
kubectl get nodes -o wide

# Show running pod
kubectl get pods -n lm -o wide

# Show image version (v2 with pgvector + NIM)
kubectl get pod -n lm -l app=lm-backend -o jsonpath='{.spec.containers[0].image}'
Write-Host ""

# Show NIM configuration
kubectl exec -n lm deployment/lm-backend -- env | Select-String "NIM_"

# Show health status
kubectl port-forward -n lm svc/lm-backend-svc 8080:80 &
Start-Sleep 2
curl http://localhost:8080/healthz 2>$null | ConvertFrom-Json | Select-Object ok, status, reasons
```

---

## Terminal 2: Code Walkthrough

```powershell
# Navigate to project
cd C:\ai-finance-agent-oss-clean\apps\backend

# Show NIM LLM provider
Write-Host "`n=== NIM LLM Provider ===" -ForegroundColor Cyan
Get-Content app\providers\nim_llm.py | Select-Object -First 40

# Show NIM Embedding provider
Write-Host "`n=== NIM Embedding Provider ===" -ForegroundColor Cyan
Get-Content app\providers\nim_embed.py | Select-Object -First 30

# Show RAG router
Write-Host "`n=== RAG Endpoints ===" -ForegroundColor Cyan
Get-Content app\routers\rag.py | Select-Object -First 50

# Show RAG models (pgvector integration)
Write-Host "`n=== pgvector Models ===" -ForegroundColor Cyan
Get-Content app\orm_models.py | Select-String -Pattern "class Rag" -Context 0,15

# Show config (NIM environment variables)
Write-Host "`n=== NIM Configuration ===" -ForegroundColor Cyan
Get-Content app\config.py | Select-String -Pattern "NIM_" -Context 0,1
```

---

## Quick Demos (After Port-Forward is Running)

```powershell
# Test RAG query endpoint
curl -X POST http://localhost:8080/agent/rag/query `
  -H "Content-Type: application/json" `
  -d '{"q":"How do credit cards work?","k":3}' 2>$null | ConvertFrom-Json

# Test agent actions endpoint (will return 401 without auth, proving it exists)
curl http://localhost:8080/agent/actions 2>$null | Select-Object -First 5

# Show all available endpoints
curl http://localhost:8080/docs 2>$null | Select-Object -First 20
```

---

## Architecture Explanation Points

### Slide 1: The Pivot Story

"We originally planned to deploy NIM with GPU nodes (g4dn.xlarge). After scanning 16 AWS regions, we found 0 GPU quota everywhere. Instead of giving up, we pivoted to NVIDIA Hosted NIM at integrate.api.nvidia.com - demonstrating cloud-native flexibility."

### Slide 2: Architecture

```
User → Frontend (React)
         ↓
       API Layer (FastAPI)
         ↓
    ┌────┴────┐
    ↓         ↓
NVIDIA NIM   pgvector RAG
(Hosted API)  (SQLite/Postgres)
    ↓
LLM: meta/llama-3.1-8b-instruct
Embed: nvidia/nv-embedqa-e5-v5
```

### Slide 3: Key Features

- ✅ **Agentic Actions:** Proactive budget alerts, subscription drift detection
- ✅ **RAG-Powered:** Semantic search over financial documents
- ✅ **Cost-Optimized:** $0/hour (Free Tier EC2 + Hosted NIM credits)
- ✅ **Production-Ready:** Health checks, migrations, monitoring
- ✅ **Cloud-Native:** Same code works with self-hosted OR hosted NIM

### Slide 4: Technical Highlights

- **Backend:** FastAPI + SQLAlchemy 2.0 + pgvector
- **Orchestration:** AWS EKS 1.30, kubectl, Helm-ready
- **LLM:** NVIDIA NIM meta/llama-3.1-8b-instruct (8B parameters)
- **Embeddings:** NVIDIA NIM nv-embedqa-e5-v5 (768-dimensional vectors)
- **Vector Store:** pgvector with HNSW indexes for semantic search

---

## Troubleshooting (If Demo Issues)

### Port-forward not working?

```powershell
# Kill existing port-forwards
Get-Job | Stop-Job
Get-Job | Remove-Job

# Start fresh
kubectl -n lm port-forward svc/lm-backend-svc 8080:80
```

### Pod not running?

```powershell
# Check pod status
kubectl get pods -n lm

# Check logs if issues
kubectl logs -n lm -l app=lm-backend --tail=50
```

### Health check fails?

```powershell
# Check if port-forward is active
netstat -an | Select-String "8080"

# Try direct pod connection
kubectl exec -n lm deployment/lm-backend -- curl localhost:8000/healthz
```

---

## Recording Tips

### Before Recording

- [ ] Close unnecessary applications
- [ ] Clear terminal history: `Clear-Host`
- [ ] Set terminal to readable font size (14-16pt)
- [ ] Test all commands once to verify they work
- [ ] Have GitHub repo open in browser
- [ ] Prepare architecture diagram (draw.io, Excalidraw)

### During Recording

- **Speak clearly and not too fast**
- **Explain WHAT you're doing before each command**
- **Show, don't just tell:** Run commands, show code
- **Highlight the pivot story:** 0 GPU quota → Hosted NIM
- **Emphasize production-readiness:** Health checks, migrations, monitoring

### After Recording

- [ ] Watch full video to check audio/video quality
- [ ] Add captions if time permits
- [ ] Upload to YouTube (unlisted)
- [ ] Copy video URL for Devpost submission

---

## Time Budget (3 minutes)

- **Intro:** 15 sec
- **Problem:** 15 sec
- **Architecture:** 45 sec
- **Code Walkthrough:** 60 sec
- **Live Demo:** 30 sec
- **Conclusion:** 15 sec

**Total: 180 seconds (3 minutes)**

---

## Quick Copy-Paste Commands (In Order)

```powershell
# 1. Setup
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"; $env:AWS_PROFILE="lm-admin"; $env:AWS_REGION="us-west-2"

# 2. Show nodes
kubectl get nodes -o wide

# 3. Show pod
kubectl get pods -n lm -o wide

# 4. Show image
kubectl get pod -n lm -l app=lm-backend -o jsonpath='{.spec.containers[0].image}'; Write-Host ""

# 5. Port-forward
kubectl -n lm port-forward svc/lm-backend-svc 8080:80 &

# 6. Health check
curl http://localhost:8080/healthz 2>$null | ConvertFrom-Json | Format-List

# 7. RAG query
curl -X POST http://localhost:8080/agent/rag/query -H "Content-Type: application/json" -d '{"q":"test","k":3}' 2>$null | ConvertFrom-Json

# 8. Show NIM config
kubectl exec -n lm deployment/lm-backend -- env | Select-String "NIM_"
```

---

🎬 **YOU'VE GOT THIS!** Record with confidence - your deployment is solid! 🚀
