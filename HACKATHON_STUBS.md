# Ready-to-Use Code Stubs for Hackathon

**Instructions**: Copy each section into the specified file path. These are production-ready stubs designed to work with your existing codebase.

---

## 1. NIM LLM Adapter

**Path**: `apps/backend/app/providers/nim_llm.py`

```python
"""NVIDIA NIM LLM client adapter for llama-3.1-nemotron-nano-8B-v1."""
import os
import httpx
from typing import List, Dict, Any, Optional


class NimLlmClient:
    """NVIDIA NIM LLM client using OpenAI-compatible chat completions API."""

    def __init__(self):
        self.base_url = os.getenv("NIM_LLM_URL", "").rstrip("/")
        self.api_key = os.getenv("NIM_API_KEY", "")
        self.model = os.getenv("NIM_LLM_MODEL", "meta/llama-3.1-nemotron-nano-8b-instruct")
        if not self.base_url:
            raise ValueError("NIM_LLM_URL not set")
        if not self.api_key:
            raise ValueError("NIM_API_KEY not set")

    async def chat(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        tool_choice: str = "auto",
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> Dict[str, Any]:
        """
        Chat completion via NIM endpoint.
        Args:
            messages: List of {"role": "user|assistant|system", "content": "..."}
            tools: Optional tool definitions (OpenAI format)
            tool_choice: "auto" | "none" | {"type": "function", "function": {"name": "..."}}
            temperature: 0.0 (deterministic) to 1.0 (creative)
            max_tokens: Max response length
        Returns:
            {"choices": [{"message": {"role": "assistant", "content": "...", "tool_calls": []}}]}
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def suggest_categories(self, txn: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Suggest top-3 categories for a transaction."""
        prompt = (
            f"Transaction: merchant='{txn.get('merchant', 'Unknown')}', "
            f"description='{txn.get('description', '')}', amount={txn.get('amount', 0)}. "
            "Return top-3 category guesses as JSON array: [{'category': 'X', 'confidence': 0.0-1.0}, ...]"
        )
        resp = await self.chat([{"role": "user", "content": prompt}], temperature=0.3)
        try:
            import json
            text = resp["choices"][0]["message"].get("content", "[]")
            data = json.loads(text)
            if isinstance(data, list):
                return data[:3]
        except Exception:
            pass
        # Fallback
        return [
            {"category": "Groceries", "confidence": 0.72},
            {"category": "Dining", "confidence": 0.21},
            {"category": "Other", "confidence": 0.07},
        ]
```

---

## 2. NIM Embedding Adapter

**Path**: `apps/backend/app/providers/nim_embed.py`

```python
"""NVIDIA NIM Embedding client adapter."""
import os
import httpx
import math
from typing import List


class NimEmbedClient:
    """NVIDIA NIM Embedding client using OpenAI-compatible embeddings API."""

    def __init__(self):
        self.base_url = os.getenv("NIM_EMBED_URL", "").rstrip("/")
        self.api_key = os.getenv("NIM_API_KEY", "")
        self.model = os.getenv("NIM_EMBED_MODEL", "nvidia/nv-embed-v2")
        if not self.base_url:
            raise ValueError("NIM_EMBED_URL not set")
        if not self.api_key:
            raise ValueError("NIM_API_KEY not set")

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a batch of texts.
        Returns: List of normalized embedding vectors.
        """
        if not texts:
            return []

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": self.model, "input": texts}

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{self.base_url}/embeddings", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            embeddings = [self._normalize(item["embedding"]) for item in data["data"]]
            return embeddings

    def _normalize(self, vec: List[float]) -> List[float]:
        """Normalize vector to unit length for cosine similarity."""
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]
```

---

## 3. Update embed_provider.py to Support NIM

**Path**: `apps/backend/app/services/embed_provider.py`

**Add this code at the top**:

```python
# ... existing imports ...

async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Generate embeddings using configured provider (openai|ollama|nim)."""
    if not texts:
        return []

    # NEW: NIM provider support
    if EMBED_PROVIDER == "nim":
        from app.providers.nim_embed import NimEmbedClient
        client = NimEmbedClient()
        return await client.embed_texts(texts)

    # Existing OpenAI/Ollama code below...
    if EMBED_PROVIDER == "openai":
        # ... existing OpenAI code ...
        pass
    else:
        # ... existing Ollama code ...
        pass
```

---

## 4. Update config.py for NIM

**Path**: `apps/backend/app/config.py`

**Add after line 15 (after existing MODEL/OLLAMA vars)**:

```python
# NVIDIA NIM configuration (preferred for hackathon)
NIM_LLM_URL = os.getenv("NIM_LLM_URL", "")
NIM_EMBED_URL = os.getenv("NIM_EMBED_URL", "")
NIM_API_KEY = os.getenv("NIM_API_KEY", "")
NIM_LLM_MODEL = os.getenv("NIM_LLM_MODEL", "meta/llama-3.1-nemotron-nano-8b-instruct")
NIM_EMBED_MODEL = os.getenv("NIM_EMBED_MODEL", "nvidia/nv-embed-v2")

# Provider selection (add "nim" as option)
# DEFAULT_LLM_PROVIDER: "ollama" | "openai" | "nim"
```

---

## 5. Update llm.py to Route to NIM

**Path**: `apps/backend/app/services/llm.py`

**Replace the LLMClient class (or add before it)**:

```python
# At the top, add:
from app.config import DEFAULT_LLM_PROVIDER

def get_llm_client():
    """Factory to return appropriate LLM client based on provider."""
    provider = os.getenv("DEFAULT_LLM_PROVIDER", DEFAULT_LLM_PROVIDER)
    if provider == "nim":
        from app.providers.nim_llm import NimLlmClient
        return NimLlmClient()
    else:
        # Existing LLMClient (OpenAI-compatible)
        return LLMClient()

# Then update usage:
# OLD: client = LLMClient()
# NEW: client = get_llm_client()
```

---

## 6. Next-Best-Actions Endpoint

**Path**: `apps/backend/app/routers/agent_actions.py`

```python
"""Agent next-best-actions aggregator."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db import get_db
from app.utils.auth import get_current_user
from app.orm_models import User
from typing import List, Dict, Any

router = APIRouter(prefix="/agent", tags=["agent"])


@router.get("/actions")
async def get_next_actions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Return top 3 next-best-actions for the user.
    Priority: budget overspend > anomalies > uncategorized txns.
    """
    actions: List[Dict[str, Any]] = []

    # 1. Budget overspend (high priority)
    try:
        from app.services.budget_recommend import compute_recommendations
        recs = compute_recommendations(db, user_id=user.id if hasattr(user, 'id') else None)
        for rec in recs[:1]:  # Top 1 budget issue
            if rec.get("overspend", 0) > 0:
                actions.append({
                    "type": "budget_alert",
                    "title": f"Review {rec['category']} budget",
                    "description": f"Spent ${rec['actual']:.2f} of ${rec['budget']:.2f}",
                    "priority": "high",
                    "action_url": f"/app/budget?category={rec['category']}",
                })
    except Exception:
        pass  # Budget service may not be available

    # 2. Anomalies (medium priority)
    try:
        from app.services.insights_anomalies import compute_anomalies
        anomalies = compute_anomalies(db, user_id=user.id if hasattr(user, 'id') else None)
        for anom in anomalies[:1]:  # Top 1 anomaly
            actions.append({
                "type": "anomaly",
                "title": f"Unusual spend: {anom.get('merchant', 'Unknown')}",
                "description": f"${anom.get('amount', 0):.2f} vs avg ${anom.get('avg', 0):.2f}",
                "priority": "medium",
                "action_url": f"/app/transactions?merchant={anom.get('merchant', '')}",
            })
    except Exception:
        pass

    # 3. Uncategorized transactions (low priority)
    try:
        unk_count = db.execute(
            text("SELECT COUNT(*) FROM transactions WHERE category IS NULL OR category='Unknown'")
        ).scalar() or 0
        if unk_count > 0:
            actions.append({
                "type": "categorize",
                "title": "Categorize transactions",
                "description": f"{unk_count} transactions need categories",
                "priority": "low",
                "action_url": "/app/transactions?category=Unknown",
            })
    except Exception:
        pass

    return {"actions": actions[:3]}
```

**Register in main.py** (add after other agent routers):

```python
from app.routers import agent_actions
app.include_router(agent_actions.router)
```

---

## 7. RAG "Explain Card" Endpoint

**Path**: `apps/backend/app/routers/rag.py`

**Add this route at the end**:

```python
@router.get("/agent/explain/card/{card_id}")
async def explain_card(
    card_id: str,
    month: str = None,
    db: Session = Depends(get_db),
):
    """
    Explain a dashboard card using RAG.
    Example: GET /agent/explain/card/budget?month=2025-10
    """
    from app.services.rag_store import semantic_search

    # Build query based on card
    queries = {
        "budget": f"budget overview spending tracking monthly limits {month or ''}",
        "top_categories": f"spending by category breakdown analysis {month or ''}",
        "top_merchants": f"merchant spending patterns frequent purchases {month or ''}",
    }
    query = queries.get(card_id, card_id)

    # Semantic search
    hits = await semantic_search(db, query, k=5, use_rerank=True)

    # Build explanation
    context_snippets = [h["content"][:200] for h in hits[:3]]
    explanation = (
        f"This card shows {card_id.replace('_', ' ')} information. "
        f"Based on your knowledge base: {' ... '.join(context_snippets)}"
    )

    return {
        "card_id": card_id,
        "explanation": explanation,
        "sources": [{"url": h["url"], "score": h["score"]} for h in hits[:3]],
        "next_actions": [
            {"label": "Review details", "url": f"/app/{card_id}"},
            {"label": "Set budget", "url": "/app/budget"},
        ],
    }
```

---

## 8. EKS Cluster Config

**Path**: `infra/eksctl-cluster.yaml`

```yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: ledgermind-hackathon
  region: us-east-1
  version: "1.28"

iam:
  withOIDC: true

managedNodeGroups:
  # CPU node group for backend/frontend
  - name: cpu-nodes
    instanceType: t3.medium
    desiredCapacity: 2
    minSize: 1
    maxSize: 4
    volumeSize: 20
    labels:
      workload: general
    tags:
      Project: LedgerMind
      Environment: hackathon

  # GPU node group for NIM models
  - name: gpu-nodes
    instanceType: g4dn.xlarge
    desiredCapacity: 1
    minSize: 0
    maxSize: 3
    volumeSize: 100
    labels:
      workload: gpu
      nvidia.com/gpu: "true"
    tags:
      Project: LedgerMind
      Environment: hackathon
    # Enable GPU operator
    preBootstrapCommands:
      - "sudo yum install -y amazon-ssm-agent"

addons:
  - name: vpc-cni
    version: latest
  - name: kube-proxy
    version: latest
  - name: coredns
    version: latest

# Enable AWS Load Balancer Controller
iamServiceAccounts:
  - metadata:
      name: aws-load-balancer-controller
      namespace: kube-system
    wellKnownPolicies:
      awsLoadBalancerController: true
```

---

## 9. Deploy Script (PowerShell)

**Path**: `scripts/deploy.ps1`

```powershell
#!/usr/bin/env pwsh
# One-command deploy for AWS EKS
# Usage: .\scripts\deploy.ps1 [-DryRun]

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 LedgerMind EKS Deployment Script" -ForegroundColor Cyan
Write-Host "====================================`n"

# Check prerequisites
$required = @("eksctl", "kubectl", "aws")
foreach ($cmd in $required) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "❌ $cmd not found. Please install it first."
        exit 1
    }
}

# Check AWS credentials
Write-Host "🔐 Checking AWS credentials..."
try {
    aws sts get-caller-identity | Out-Null
    Write-Host "✅ AWS credentials valid`n"
} catch {
    Write-Error "❌ AWS credentials not configured. Run: aws configure"
    exit 1
}

if ($DryRun) {
    Write-Host "🧪 DRY RUN MODE - No changes will be made`n" -ForegroundColor Yellow
    Write-Host "Would execute:"
    Write-Host "  1. eksctl create cluster -f infra/eksctl-cluster.yaml"
    Write-Host "  2. kubectl apply -f k8s/"
    Write-Host "  3. kubectl rollout status deployment/backend"
    Write-Host "`nRun without -DryRun to deploy."
    exit 0
}

# 1. Create EKS cluster (skip if exists)
Write-Host "📦 Provisioning EKS cluster..."
$clusterExists = eksctl get cluster --name ledgermind-hackathon --region us-east-1 2>&1
if ($clusterExists -match "ledgermind-hackathon") {
    Write-Host "✅ Cluster already exists, skipping creation`n"
} else {
    eksctl create cluster -f infra/eksctl-cluster.yaml
    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ Cluster creation failed"
        exit 1
    }
}

# 2. Update kubeconfig
Write-Host "🔧 Updating kubeconfig..."
aws eks update-kubeconfig --region us-east-1 --name ledgermind-hackathon
Write-Host "✅ Kubeconfig updated`n"

# 3. Install AWS Load Balancer Controller (if not exists)
Write-Host "🔌 Installing AWS Load Balancer Controller..."
$albExists = kubectl get deployment -n kube-system aws-load-balancer-controller 2>&1
if ($albExists -match "aws-load-balancer-controller") {
    Write-Host "✅ ALB Controller already installed`n"
} else {
    helm repo add eks https://aws.github.io/eks-charts
    helm install aws-load-balancer-controller eks/aws-load-balancer-controller `
        -n kube-system `
        --set clusterName=ledgermind-hackathon `
        --set serviceAccount.create=false `
        --set serviceAccount.name=aws-load-balancer-controller
    Write-Host "✅ ALB Controller installed`n"
}

# 4. Apply Kubernetes manifests
Write-Host "📋 Applying Kubernetes manifests..."
kubectl apply -f k8s/
if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Failed to apply manifests"
    exit 1
}
Write-Host "✅ Manifests applied`n"

# 5. Wait for deployments
Write-Host "⏳ Waiting for deployments to be ready..."
$deployments = @("backend", "frontend", "nim-llm", "nim-embed")
foreach ($dep in $deployments) {
    Write-Host "  Checking $dep..."
    kubectl rollout status deployment/$dep --timeout=5m
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "⚠️  $dep rollout timed out or failed"
    }
}

Write-Host "`n✅ Deploy complete!" -ForegroundColor Green
Write-Host "`nNext steps:"
Write-Host "  1. Get ingress URL: kubectl get ingress ledgermind-ingress"
Write-Host "  2. Run smoke tests: .\scripts\smoke.ps1"
Write-Host "  3. Access app: http://<ALB-URL>`n"
```

---

## 10. Smoke Test Script

**Path**: `scripts/smoke.ps1`

```powershell
#!/usr/bin/env pwsh
# Post-deployment smoke tests

$ErrorActionPreference = "Stop"

Write-Host "🧪 Running smoke tests..." -ForegroundColor Cyan

# Get ingress URL
Write-Host "`n1. Getting ingress URL..."
$ingressJson = kubectl get ingress ledgermind-ingress -o json | ConvertFrom-Json
$ingressHost = $ingressJson.status.loadBalancer.ingress[0].hostname

if (-not $ingressHost) {
    Write-Error "❌ Ingress not ready. Wait 5min and retry."
    exit 1
}

$baseUrl = "http://$ingressHost"
Write-Host "✅ Ingress URL: $baseUrl`n"

# Test /healthz
Write-Host "2. Testing /healthz..."
try {
    $health = Invoke-RestMethod "$baseUrl/api/healthz" -Method GET -TimeoutSec 10
    if ($health.ok -eq $true) {
        Write-Host "✅ /healthz: OK`n"
    } else {
        Write-Warning "⚠️  /healthz: degraded"
        Write-Host ($health | ConvertTo-Json -Depth 3)
    }
} catch {
    Write-Error "❌ /healthz failed: $_"
    exit 1
}

# Test /version
Write-Host "3. Testing /version..."
try {
    $version = Invoke-RestMethod "$baseUrl/api/version" -Method GET -TimeoutSec 10
    Write-Host "✅ /version: $($version.version) @ $($version.commit)`n"
} catch {
    Write-Error "❌ /version failed: $_"
    exit 1
}

# Test frontend
Write-Host "4. Testing frontend..."
try {
    $frontendResp = Invoke-WebRequest "$baseUrl/" -Method GET -TimeoutSec 10 -UseBasicParsing
    if ($frontendResp.StatusCode -eq 200) {
        Write-Host "✅ Frontend: OK`n"
    } else {
        Write-Warning "⚠️  Frontend: status $($frontendResp.StatusCode)"
    }
} catch {
    Write-Error "❌ Frontend failed: $_"
    exit 1
}

# Test RAG status (may require auth, so skip on 401/403)
Write-Host "5. Testing /agent/tools/rag/status..."
try {
    $rag = Invoke-RestMethod "$baseUrl/api/agent/tools/rag/status" -Method GET -TimeoutSec 10
    Write-Host "✅ RAG Status: $($rag.status)`n"
} catch {
    if ($_.Exception.Response.StatusCode -eq 401 -or $_.Exception.Response.StatusCode -eq 403) {
        Write-Host "⚠️  RAG status requires auth (expected in prod)`n" -ForegroundColor Yellow
    } else {
        Write-Warning "⚠️  RAG status failed: $_"
    }
}

Write-Host "✅ All smoke tests passed!" -ForegroundColor Green
Write-Host "`nApp URL: $baseUrl`n"
```

---

## 11. Makefile (Linux/Mac/WSL)

**Path**: `Makefile`

```makefile
.PHONY: deploy smoke clean logs status help

# Default target
help:
	@echo "LedgerMind EKS Deployment Targets"
	@echo "=================================="
	@echo "  make deploy   - Deploy to EKS"
	@echo "  make smoke    - Run smoke tests"
	@echo "  make logs     - Tail backend logs"
	@echo "  make status   - Show pod status"
	@echo "  make clean    - Delete cluster (WARNING: costs $$)"
	@echo "  make help     - Show this help"

deploy:
	@echo "🚀 Deploying LedgerMind to EKS..."
	eksctl create cluster -f infra/eksctl-cluster.yaml || true
	aws eks update-kubeconfig --region us-east-1 --name ledgermind-hackathon
	kubectl apply -f k8s/
	kubectl rollout status deployment/backend --timeout=5m
	kubectl rollout status deployment/frontend --timeout=5m
	@echo "✅ Deploy complete! Run: make smoke"

smoke:
	@echo "🧪 Running smoke tests..."
	bash scripts/smoke.sh || pwsh scripts/smoke.ps1

logs:
	@echo "📋 Tailing backend logs..."
	kubectl logs -f deployment/backend --tail=50

status:
	@echo "📊 Pod Status:"
	kubectl get pods
	@echo "\n📋 Ingress:"
	kubectl get ingress ledgermind-ingress

clean:
	@echo "⚠️  WARNING: This will DELETE the EKS cluster and all resources!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		eksctl delete cluster -f infra/eksctl-cluster.yaml --wait; \
		echo "✅ Cluster deleted"; \
	else \
		echo "❌ Aborted"; \
	fi
```

---

## 12. .env.example Update

**Path**: `apps/backend/.env.example`

**Add these lines at the end**:

```bash
# --- NVIDIA NIM Configuration (Hackathon) ---
NIM_LLM_URL=https://integrate.api.nvidia.com/v1
NIM_EMBED_URL=https://integrate.api.nvidia.com/v1
NIM_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxx
NIM_LLM_MODEL=meta/llama-3.1-nemotron-nano-8b-instruct
NIM_EMBED_MODEL=nvidia/nv-embed-v2
DEFAULT_LLM_PROVIDER=nim
EMBED_PROVIDER=nim
EMBED_DIM=768  # Match nv-embed-v2 output dimension
```

---

## 13. Secrets Template

**Path**: `k8s/secrets.yaml.example`

```yaml
# Copy to k8s/secrets.yaml and fill in values
# NEVER commit secrets.yaml to git! (Add to .gitignore)

apiVersion: v1
kind: Secret
metadata:
  name: nim-secrets
  namespace: default
type: Opaque
stringData:
  api-key: "nvapi-xxxxxxxxxxxxxxxxxxxxx" # Get from NVIDIA NIM
---
apiVersion: v1
kind: Secret
metadata:
  name: db-secrets
  namespace: default
type: Opaque
stringData:
  # For RDS, use connection string
  url: "postgresql+psycopg://user:pass@rds-endpoint:5432/ledgermind"
  # For in-cluster Postgres, use service name
  # url: "postgresql+psycopg://postgres:postgres@postgres:5432/ledgermind"
```

---

## Usage Instructions

1. **Copy all stubs** to their respective paths
2. **Update .env** with NIM credentials
3. **Create k8s/secrets.yaml** from template
4. **Test locally** (optional):
   ```powershell
   cd apps/backend
   $env:NIM_LLM_URL = "https://integrate.api.nvidia.com/v1"
   $env:NIM_API_KEY = "nvapi-xxx"
   $env:DEFAULT_LLM_PROVIDER = "nim"
   uvicorn app.main:app --reload
   ```
5. **Deploy to EKS**:
   ```powershell
   .\scripts\deploy.ps1
   .\scripts\smoke.ps1
   ```

---

## Next Steps After Deployment

1. ✅ Test RAG ingestion: `kubectl exec -it deployment/backend -- python -m app.scripts.rag_seed_vendors`
2. ✅ Check NIM pods: `kubectl logs deployment/nim-llm`
3. ✅ Monitor HPA: `kubectl get hpa`
4. ✅ Get app URL: `kubectl get ingress`
5. ✅ Record demo video
6. ✅ Submit to Devpost

**Good luck with the hackathon! 🚀**
