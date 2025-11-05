# Hackathon Quick Reference - 48h Sprint

**Priority**: Fix CRITICAL/HIGH gaps first (24h), then MEDIUM (12h), polish last (12h)

---

## Day 1 (24h) - Core Infrastructure

### Morning (8h): NIM Adapters + Config

1. ✅ Create `apps/backend/app/providers/nim_llm.py` (stub provided in audit)
2. ✅ Create `apps/backend/app/providers/nim_embed.py` (stub provided)
3. ✅ Update `apps/backend/app/config.py` → add `NIM_LLM_URL`, `NIM_API_KEY`, `NIM_LLM_MODEL`
4. ✅ Update `apps/backend/app/services/embed_provider.py` → add NIM case
5. ✅ Update `apps/backend/app/services/llm.py` → route to NIM client

**Test**:

```powershell
$env:NIM_LLM_URL = "https://integrate.api.nvidia.com/v1"
$env:NIM_API_KEY = "nvapi-xxx"
$env:DEFAULT_LLM_PROVIDER = "nim"
cd apps/backend
python -m pytest tests/test_nim_llm.py
```

### Afternoon (8h): EKS Cluster + K8s Manifests

1. ✅ Create `infra/eksctl-cluster.yaml` (2 node groups: CPU + GPU)
2. ✅ Create `k8s/nim-llm-deploy.yaml` (stub provided)
3. ✅ Create `k8s/nim-embed-deploy.yaml`
4. ✅ Create `k8s/backend.yaml` (stub provided)
5. ✅ Create `k8s/frontend.yaml`
6. ✅ Create `k8s/postgres-pgvector.yaml` (StatefulSet or RDS secret)
7. ✅ Create `k8s/ingress.yaml` (ALB controller)
8. ✅ Create `k8s/secrets.yaml.example` (template for NIM_API_KEY, DB_URL)

**Test**:

```powershell
eksctl create cluster -f infra/eksctl-cluster.yaml --dry-run
```

### Evening (8h): Deploy Script + Smoke Tests

1. ✅ Create `scripts/deploy.ps1` (stub provided)
2. ✅ Create `scripts/deploy.sh` (WSL version)
3. ✅ Create `scripts/smoke.ps1` (stub provided)
4. ✅ Create `Makefile` with `deploy`, `smoke`, `clean` targets
5. ✅ Test locally with kind/minikube before pushing to EKS

**Test**:

```powershell
# Dry run
.\scripts\deploy.ps1 -DryRun
# Real deploy (WARNING: costs $$$)
.\scripts\deploy.ps1
.\scripts\smoke.ps1
```

---

## Day 2 Morning (8h) - Agentic Features

### Tasks (4h): RAG + Next Actions

1. ✅ Add `GET /agent/explain/card/{card_id}` to `apps/backend/app/routers/rag.py`
2. ✅ Create `apps/backend/app/routers/agent_actions.py` (stub provided)
3. ✅ Update `apps/web/src/help/HelpPopover.tsx` → call `/agent/explain/card`
4. ✅ Wire "Next Actions" button in frontend (optional UI)

**Test**:

```powershell
curl http://localhost:8000/agent/explain/card/budget?month=2025-10
curl http://localhost:8000/agent/actions
```

### Tasks (4h): KB Assets + Seed Scripts

1. ✅ Create `kb/hackathon-rules.md` (copy hackathon requirements)
2. ✅ Create `kb/nim-guide.md` (NIM setup, API keys)
3. ✅ Create `samples/demo-txns.csv` (50 sample transactions)
4. ✅ Update `apps/backend/app/scripts/rag_seed_vendors.py` → ingest KB
5. ✅ Run seed: `docker exec -it backend python -m app.scripts.rag_seed_vendors`

---

## Day 2 Afternoon (8h) - Documentation

### Hackathon Docs (4h)

1. ✅ Create `hackathon/README.md` (stub provided in audit)
2. ✅ Create `hackathon/UPDATES.md` (changelog template)
3. ✅ Create `hackathon/demo-script.md` (stub provided)
4. ✅ Create `LICENSE` (MIT or Apache-2.0)
5. ✅ Create `ATTRIBUTIONS.md` (FastAPI, React, pgvector, NVIDIA)

**Template**:

```markdown
# UPDATES.md

## 2025-11-01

- ✅ Added NIM LLM adapter (llama-3.1-nemotron-nano-8B-v1)
- ✅ Added NIM Embedding adapter (nvidia/nv-embed-v2)
- ✅ Created EKS deployment manifests
- ✅ Implemented Next-Best-Actions aggregator
```

### CI Workflow (2h)

1. ✅ Create `.github/workflows/ci.yml` (test + build)
2. ✅ Add ECR push step (optional, needs AWS creds)

### HPA + Budget Controls (2h)

1. ✅ Create `k8s/hpa-backend.yaml` (stub provided)
2. ✅ Create `k8s/hpa-nim-llm.yaml`
3. ✅ Create `k8s/cronjob-ttl.yaml` (scale down after hours, optional)
4. ✅ Document AWS Budget alarms in `hackathon/README.md`

---

## Day 2 Evening (8h) - Demo Prep

### Demo Video (3h)

1. ✅ Practice demo script 3x (aim for 2:45, buffer for mistakes)
2. ✅ Record screen with OBS/Camtasia
3. ✅ Add voiceover or live narration
4. ✅ Edit: Add title slide, captions, cursor highlight
5. ✅ Upload to YouTube (unlisted or public)

### Polish (3h)

1. ✅ Update root `README.md` → link to `hackathon/README.md`
2. ✅ Add screenshots to hackathon docs
3. ✅ Test deploy on fresh EKS cluster (tear down + redeploy)
4. ✅ Final smoke tests

### Submission (2h)

1. ✅ Push all changes to GitHub (make repo public if private)
2. ✅ Create Devpost submission
3. ✅ Fill checklist (copy from `HACKATHON_AUDIT.md` section 5)
4. ✅ Add GitHub URL, demo video, live demo URL (if EKS still running)
5. ✅ Submit before deadline

---

## Critical Path (Must-Haves)

```
┌─────────────────────────────────────────────────────┐
│ MUST HAVE (Will be rejected without)               │
├─────────────────────────────────────────────────────┤
│ ✅ NIM LLM adapter (llama-3.1-nemotron-nano-8B-v1)  │
│ ✅ NIM Embedding adapter (any retrieval model)      │
│ ✅ EKS deployment (or SageMaker fallback)           │
│ ✅ RAG system (vector DB + semantic search)         │
│ ✅ Agentic behavior (tool calling)                  │
│ ✅ Public repo with README                          │
│ ✅ One-command deploy                               │
│ ✅ 3-minute demo video                              │
│ ✅ LICENSE (OSS)                                    │
└─────────────────────────────────────────────────────┘
```

---

## Time Budget Breakdown

| Task                    | Time    | Priority     |
| ----------------------- | ------- | ------------ |
| NIM adapters + config   | 3h      | CRITICAL     |
| EKS cluster + manifests | 8h      | CRITICAL     |
| Deploy script + smoke   | 5h      | HIGH         |
| RAG explain endpoint    | 2h      | HIGH         |
| Next actions aggregator | 2h      | MEDIUM       |
| KB assets + seed        | 2h      | MEDIUM       |
| Hackathon README        | 2h      | CRITICAL     |
| Demo script             | 1h      | HIGH         |
| LICENSE + attributions  | 1h      | CRITICAL     |
| CI workflow             | 2h      | MEDIUM       |
| HPA + budget controls   | 2h      | LOW          |
| Demo video recording    | 3h      | CRITICAL     |
| Polish + screenshots    | 2h      | LOW          |
| Final deploy + test     | 2h      | HIGH         |
| Devpost submission      | 1h      | CRITICAL     |
| **TOTAL**               | **38h** | (10h buffer) |

---

## Cost Estimates (AWS)

**Dev/Test (8h)**:

- EKS control plane: $0.80
- 2x t3.medium nodes: $0.80
- NAT Gateway: $0.40
- **Total**: ~$2/day

**Hackathon Demo (24h)**:

- EKS control plane: $2.40
- 2x t3.medium (CPU): $2.40
- 1x g4dn.xlarge (GPU, NIM): $15.60
- RDS t3.micro: $0.48
- ALB: $0.60
- **Total**: ~$21/day

**Tip**: Use `eksctl delete cluster` after demo to avoid ongoing charges!

---

## Troubleshooting Quick Fixes

### NIM adapter fails

```powershell
# Check API key
$env:NIM_API_KEY
# Check endpoint
curl $env:NIM_LLM_URL/models
```

### EKS cluster creation hangs

```powershell
# Check CloudFormation stacks
aws cloudformation describe-stacks --region us-east-1
# Force delete
eksctl delete cluster -f infra/eksctl-cluster.yaml --wait
```

### pgvector index missing

```sql
-- Connect to Postgres
psql $DATABASE_URL
-- Check extension
SELECT extname FROM pg_extension WHERE extname='vector';
-- Create if missing
CREATE EXTENSION IF NOT EXISTS vector;
-- Check index
\d rag_chunks
```

### Ingress not ready

```powershell
# Check ALB controller
kubectl get pods -n kube-system | Select-String alb
# Check ingress
kubectl describe ingress ledgermind-ingress
# Manual LB creation (fallback)
kubectl expose deployment frontend --type=LoadBalancer --port=80
```

---

## Emergency Fallback (If EKS Fails)

**Option 1: Docker Compose (Local Demo)**

1. Create `docker-compose.hackathon.yml`
2. Add services: frontend, backend, nim-llm (mock), postgres
3. Demo locally, record video
4. Mention in submission: "Designed for EKS, demo on local due to [reason]"

**Option 2: SageMaker Endpoints**

1. Deploy NIM models to SageMaker
2. Update backend config → SageMaker invoke URL
3. Keep frontend/backend on EKS or EC2
4. Document in `hackathon/SAGEMAKER_FALLBACK.md`

---

## Final Pre-Submission Checklist

```markdown
- [ ] Repo is public on GitHub
- [ ] All code pushed (no uncommitted changes)
- [ ] LICENSE file present (MIT/Apache-2.0)
- [ ] hackathon/README.md complete
- [ ] hackathon/UPDATES.md populated
- [ ] hackathon/demo-script.md finalized
- [ ] Demo video uploaded (public/unlisted)
- [ ] Live demo accessible (EKS ingress URL works)
- [ ] Smoke tests pass (healthz, version, rag/status)
- [ ] Screenshots in docs (dashboard, help tooltip, next actions)
- [ ] Attributions complete (NVIDIA, AWS, OSS libs)
- [ ] Devpost draft saved (double-check all fields)
- [ ] Team member emails added (if applicable)
- [ ] Submit button clicked ✅
```

---

## Contact & Support

**Questions during sprint?**

- Check `HACKATHON_AUDIT.md` section 2 (Gap Report) for detailed fixes
- Search existing issues in GitHub
- Ping team on Discord/Slack

**Post-submission?**

- Monitor Devpost for judge feedback
- Prepare for live Q&A (if selected)
- Keep EKS cluster running for 1 week (judges may test)

---

**Good luck! 🚀**
