# 🎬 Final Pre-Recording Checklist

## Agentic AI Unleashed Hackathon - Demo Recording Prep

**Deadline**: Nov 3, 2025 2:00 PM ET (6 hours remaining)

---

## ✅ Production Readiness (COMPLETE)

- [x] **Persistent Storage**: PVC `lm-sqlite-pvc` mounted at `/data`, database survives restarts
- [x] **Feature Flags**: `RAG_STORE`, `EMBED_INPUT_TYPE_*`, `NIM_TIMEOUT_SEC`, `EMBED_BATCH_SIZE` in config.py
- [x] **Health Probes**: `/healthz` returns structured `checks` object with `embeddings_count`
- [x] **Structured Logging**: rag.py logs timing metrics (elapsed_ms, total_ms, top1_score)
- [x] **Rate Limits**: Batch size 16, timeout 30s, configurable via env vars
- [x] **Resilience**: 429 retry with exponential backoff, cosine clamping [-1,1], empty vector guards
- [x] **Smoke Test**: `smoke-test.ps1` validates health + semantic search end-to-end
- [x] **Documentation**: README.md documents asymmetric embeddings, pgvector upgrade path
- [x] **Upgrade Path**: SQLite → pgvector migration documented for post-hackathon scale
- [x] **This Checklist**: Meta-completion! 🎉

---

## 🚀 Pre-Demo Deployment (PENDING)

- [ ] **Build v7 Docker Image**:
  ```powershell
  cd c:\ai-finance-agent-oss-clean\apps\backend
  docker build -t 103102677735.dkr.ecr.us-west-2.amazonaws.com/ledgermind:v7 -f Dockerfile .
  ```
- [ ] **Push to ECR**:
  ```powershell
  aws ecr get-login-password --region us-west-2 --profile lm-admin | docker login --username AWS --password-stdin 103102677735.dkr.ecr.us-west-2.amazonaws.com
  docker push 103102677735.dkr.ecr.us-west-2.amazonaws.com/ledgermind:v7
  ```
- [ ] **Deploy to EKS**:
  ```powershell
  kubectl -n lm set image deployment/lm-backend api=103102677735.dkr.ecr.us-west-2.amazonaws.com/ledgermind:v7
  kubectl -n lm delete pod -l app=lm-backend --force --grace-period=0
  kubectl -n lm wait --for=condition=ready pod -l app=lm-backend --timeout=120s
  ```
- [ ] **Verify Deployment**:
  ```powershell
  kubectl -n lm get pods -o wide
  kubectl -n lm logs -l app=lm-backend --tail=50
  ```

---

## 🧪 System Validation (PENDING)

- [ ] **Run Smoke Test**:

  ```powershell
  .\smoke-test.ps1
  ```

  Expected output:

  - ✅ Health check OK
  - ✅ Embeddings count: 632
  - ✅ Query 1: "credit card rewards" returns results with score >0.4
  - ✅ Query 2: "budget planning" returns results with score >0.4

- [ ] **Manual Verification**:

  ```powershell
  # Port-forward for manual testing
  kubectl -n lm port-forward svc/lm-backend-svc 8080:80

  # Check health with embeddings_count
  curl http://localhost:8080/healthz | ConvertFrom-Json | Select-Object -Expand checks

  # Test RAG query
  curl -X POST http://localhost:8080/agent/rag/query `
    -H "content-type: application/json" `
    -d '{"q":"How do credit card rewards work?","k":3}' | ConvertFrom-Json
  ```

- [ ] **Persistent Storage Test**:

  ```powershell
  # Delete pod to test PVC persistence
  kubectl -n lm delete pod -l app=lm-backend --force --grace-period=0
  kubectl -n lm wait --for=condition=ready pod -l app=lm-backend --timeout=120s

  # Re-run smoke test - embeddings_count should still be 632
  .\smoke-test.ps1
  ```

---

## 🎥 Demo Recording (3 minutes)

### Script Outline:

1. **Intro (15s)**: "Hi, I'm presenting LedgerMind - a personal finance AI agent built with NVIDIA NIM and AWS EKS"
2. **Architecture (30s)**: Show EKS cluster, explain NVIDIA Hosted NIM (meta/llama-3.1-8b-instruct + nv-embedqa-e5-v5)
3. **RAG Demo (60s)**:
   - Show health check with embeddings_count: 632
   - Run semantic search query: "How do credit card rewards work?"
   - Show relevant results with similarity scores >0.4
   - Explain asymmetric embeddings (query vs passage input_type)
4. **Production Features (45s)**:
   - Show persistent storage (PVC mounted at /data)
   - Show structured logs with timing metrics
   - Demonstrate resilience (retry logic, cosine clamping)
   - Run smoke test showing all checks pass
5. **Cost Optimization (15s)**: "Running on AWS Free Tier - 2× t3.micro CPU nodes, $0 compute cost"
6. **Wrap-up (15s)**: "Production-ready RAG with NVIDIA NIM embeddings, ready for scale with pgvector upgrade path"

### Recording Checklist:

- [ ] **Start Cloudflare Tunnel**: `Get-Process cloudflared` (ensure running)
- [ ] **Record Screen**: Use OBS / PowerPoint Recording / Windows Game Bar
- [ ] **Show Terminal**: Clear history, increase font size for visibility
- [ ] **Demonstrate Queries**: Prepare 2-3 test queries in advance
- [ ] **Show Logs**: `kubectl logs` showing structured JSON logs with timing
- [ ] **Keep Under 3 Minutes**: Time yourself, aim for 2:45 to allow buffer

---

## 📤 Devpost Submission

- [ ] **Upload Video**: YouTube (unlisted) or Vimeo
- [ ] **Update README**: Add video link to root README.md
- [ ] **Fill Devpost Form**:

  - Project name: LedgerMind
  - Tagline: "AI-powered personal finance agent with NVIDIA NIM RAG"
  - Tech stack: AWS EKS, NVIDIA NIM (LLM + Embeddings), SQLite, FastAPI, React
  - Challenges: AWS × NVIDIA "Agentic AI Unleashed"
  - GitHub repo: https://github.com/yourusername/ai-finance-agent (update with actual URL)
  - Video URL: (from upload step)
  - Key achievements:
    - ✅ Fully functional RAG with semantic search (632 embeddings)
    - ✅ Asymmetric embedding handling (query vs passage)
    - ✅ Production-ready resilience (retry, clamping, timeouts)
    - ✅ $0 compute cost (AWS Free Tier t3.micro nodes)
    - ✅ Persistent storage with Kubernetes PVC
    - ✅ Upgrade path to pgvector for scale

- [ ] **Submit Before 1:45 PM ET**: Allow 15-minute buffer before hard deadline
- [ ] **Verify Submission**: Check Devpost confirmation email

---

## 🎯 Success Criteria

- ✅ All code changes deployed in v7
- ✅ Smoke test passes (health + 2 semantic searches)
- ✅ Embeddings persist across pod restarts (count=632)
- ✅ Demo video uploaded and linked in submission
- ✅ Devpost submission confirmed before 2:00 PM ET

---

## 🚨 Rollback Plan (If v7 Breaks)

```powershell
# Rollback to working v6
kubectl -n lm set image deployment/lm-backend api=103102677735.dkr.ecr.us-west-2.amazonaws.com/ledgermind:v6
kubectl -n lm delete pod -l app=lm-backend --force --grace-period=0

# Record demo with v6 (still has working RAG, just less production-hardened)
```

---

## 📋 Post-Submission (Optional)

- [ ] Clean up AWS resources to avoid charges after Free Tier expires
- [ ] Implement pgvector migration for production scale
- [ ] Add multi-document querying with source attribution
- [ ] Integrate RAG with LLM chat endpoint for full agentic workflow
- [ ] Add telemetry/metrics (Prometheus, CloudWatch)
