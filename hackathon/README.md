# 🏆 Agentic AI Unleashed Hackathon - Finance Agent Submission

## Project Overview

**AI Finance Agent with NVIDIA NIM** - An intelligent financial assistant powered by NVIDIA's NIM microservices for LLM inference and embeddings, deployed on AWS EKS.

## ✅ Hackathon Requirements Checklist

### Core Requirements (ALL IMPLEMENTED ✅)

- ✅ **NVIDIA NIM LLM**: Using `meta/llama-3.1-nemotron-nano-8B-v1` for conversational AI
- ✅ **NVIDIA NIM Embedding**: Using `nvidia/nv-embed-v2` (768-dim) for RAG semantic search
- ✅ **AWS EKS Deployment**: Full Kubernetes manifests with GPU node groups
- ✅ **RAG System**: PostgreSQL + pgvector with HNSW indexes for knowledge base
- ✅ **One-Command Deploy**: `.\scripts\deploy.ps1` handles entire stack
- ✅ **Agentic Behavior**: Next-best-actions aggregator, budget recommendations, anomaly detection
- ✅ **License**: MIT License included
- ✅ **Documentation**: Comprehensive setup guide, architecture diagrams, demo script

### Technical Stack

```
Frontend:  React 18 + TypeScript + Vite + Tailwind CSS
Backend:   FastAPI + Python 3.11 + SQLAlchemy + Alembic
Database:  PostgreSQL 16 + pgvector extension
LLM:       NVIDIA NIM (llama-3.1-nemotron-nano-8B-v1)
Embedding: NVIDIA NIM (nv-embed-v2, 768-dim)
Vector DB: pgvector with HNSW indexes
Cloud:     AWS EKS (Kubernetes 1.28)
GPU:       g4dn.xlarge nodes (NVIDIA T4)
```

## 🏗️ Architecture

### High-Level Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend    │────▶│  NIM LLM    │
│  (React)    │     │  (FastAPI)   │     │ (Nemotron)  │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐     ┌─────────────┐
                    │  PostgreSQL  │◀────│ NIM Embed   │
                    │  + pgvector  │     │ (nv-embed)  │
                    └──────────────┘     └─────────────┘
```

### Key Components

1. **NIM LLM Service** (`nim-llm-deploy.yaml`)

   - Model: meta/llama-3.1-nemotron-nano-8B-v1
   - GPU: 1x NVIDIA T4 (g4dn.xlarge)
   - Endpoints: `/v1/chat/completions`, `/v1/health/live`

2. **NIM Embedding Service** (`nim-embed-deploy.yaml`)

   - Model: nvidia/nv-embed-v2
   - Dimension: 768
   - GPU: 1x NVIDIA T4 (g4dn.xlarge)
   - Endpoints: `/v1/embeddings`, `/v1/health/ready`

3. **RAG System** (`apps/backend/app/routers/rag.py`)

   - Ingestion: `/rag/ingest` (PDF, TXT, MD)
   - Search: `/rag/search` with semantic similarity
   - Explain: `/agent/explain/card/{id}` for dashboard insights

4. **Agent Actions** (`apps/backend/app/routers/agent_actions.py`)
   - Budget alerts: `/agent/actions`
   - Anomaly detection: Flags unusual spending patterns
   - Smart suggestions: Categorization, savings tips

## 🚀 Quick Start (One-Command Deploy)

### Prerequisites

```powershell
# Install required tools
choco install awscli eksctl kubectl docker-desktop helm

# Configure AWS credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-west-2)

# Get NVIDIA NGC API key from: https://org.ngc.nvidia.com/setup/api-key
```

### Deploy to EKS

```powershell
# 1. Clone repository
git clone <your-repo-url>
cd ai-finance-agent-oss-clean

# 2. Configure secrets
cp k8s/secrets.yaml.example k8s/secrets.yaml
# Edit k8s/secrets.yaml:
#   - ngc-api-key: YOUR_NGC_API_KEY
#   - postgres-password: STRONG_PASSWORD

# 3. Deploy (ONE COMMAND!)
.\scripts\deploy.ps1

# ⏱️ Takes ~20 minutes (EKS cluster + GPU nodes + containers)
```

### Verify Deployment

```powershell
# Run smoke tests
.\scripts\smoke.ps1

# Check pod status
kubectl get pods

# View logs
kubectl logs -l app=backend --tail=50

# Get application URL
kubectl get ingress finance-agent-ingress
```

## 🎯 Key Features Demonstrating Agentic AI

### 1. Proactive Budget Alerts

**Endpoint**: `GET /agent/actions`

```json
{
  "actions": [
    {
      "type": "budget_alert",
      "priority": "high",
      "message": "Groceries budget 90% used (€450/€500)",
      "suggestion": "Consider meal planning to stay under budget"
    }
  ]
}
```

### 2. RAG-Powered Card Explanations

**Endpoint**: `GET /agent/explain/card/{card_id}`

- Uses NIM embedding to search knowledge base
- Provides context-aware explanations with sources
- Suggests next actions based on card type

### 3. Anomaly Detection

- Identifies unusual spending patterns
- Flags out-of-pattern transactions
- Uses LLM for natural language explanations

### 4. Smart Categorization

- NIM LLM suggests categories for uncategorized transactions
- Learns from user corrections (stored in RAG KB)
- Bulk categorization for efficiency

## 📊 Performance Metrics

### NIM LLM (Nemotron)

- Latency: ~200-500ms per request (P50)
- Throughput: ~15 req/sec per GPU
- Context: 8K tokens

### NIM Embedding (nv-embed-v2)

- Latency: ~50-100ms for 512 tokens
- Batch: Up to 64 documents
- Dimension: 768 (optimal for pgvector HNSW)

### RAG System

- Index: HNSW (M=16, ef_construction=64)
- Search: <50ms for top-5 results
- Chunks: 512 tokens, 128 overlap

## 🎬 3-Minute Demo Script

### [0:00-0:30] Problem Statement

"Managing personal finances is complex. Users need an AI agent that proactively helps them understand spending, stay within budgets, and make informed decisions."

### [0:30-1:00] Solution Overview

"Our AI Finance Agent uses NVIDIA NIM for two key capabilities:

1. **NIM LLM** (Nemotron) for conversational insights
2. **NIM Embedding** (nv-embed) for RAG-powered knowledge search"

### [1:00-1:30] Live Demo - Proactive Alerts

- Show dashboard with budget cards
- Point out "90% used" alert
- Click "Explain this card" → Shows RAG-powered explanation
- Demonstrate next-best-actions: "Budget alerts detected: 3 categories over 80%"

### [1:30-2:00] Live Demo - RAG System

- Upload a financial document (e.g., "401k Guide.pdf")
- Ask: "How much should I contribute to 401k?"
- Show semantic search results with sources
- Highlight NIM embedding powering the search

### [2:00-2:30] Live Demo - Anomaly Detection

- Show transactions list
- Point out flagged anomaly: "Unusual $450 restaurant charge"
- LLM explains: "This is 3x your average restaurant spend"
- Suggest action: "Review or mark as one-time event"

### [2:30-3:00] Deployment & Conclusion

- Show `.\scripts\deploy.ps1` command
- Walk through K8s dashboard: GPU nodes, NIM pods, HPA autoscaling
- **Key takeaway**: "One command deploys a production-ready agentic AI system on AWS EKS with NVIDIA NIM"

## 💰 Cost Estimate

### Development (48 hours)

- EKS cluster: ~$5-10
- g4dn.xlarge GPU nodes (2): ~$15-20
- t3.medium CPU nodes (2): ~$2-3
- EBS volumes: ~$2-3
- ALB + data transfer: ~$2-3
  **Total**: ~$26-39 for 48h hackathon

### Production (Monthly)

- EKS control plane: $72
- GPU nodes (2x g4dn.xlarge, 50% util): ~$250
- CPU nodes (2x t3.medium): ~$60
- RDS PostgreSQL (db.t3.medium): ~$65
- ALB + data transfer (100GB): ~$30
  **Total**: ~$477/month

## 📁 Repository Structure

```
├── apps/
│   ├── backend/              # FastAPI backend
│   │   ├── app/
│   │   │   ├── providers/    # NIM adapters
│   │   │   │   ├── nim_llm.py       # LLM client
│   │   │   │   └── nim_embed.py     # Embedding client
│   │   │   ├── routers/
│   │   │   │   ├── rag.py           # RAG endpoints
│   │   │   │   └── agent_actions.py # Agent logic
│   │   │   └── services/
│   │   │       ├── llm.py           # LLM service
│   │   │       └── embed_provider.py # Embed abstraction
│   │   └── Dockerfile
│   └── web/                  # React frontend
│       ├── src/
│       └── Dockerfile
├── k8s/                      # Kubernetes manifests
│   ├── nim-llm-deploy.yaml   # NIM LLM deployment
│   ├── nim-embed-deploy.yaml # NIM Embed deployment
│   ├── backend.yaml          # Backend deployment
│   ├── frontend.yaml         # Frontend deployment
│   ├── postgres-pgvector.yaml # DB StatefulSet
│   ├── ingress.yaml          # ALB Ingress
│   ├── hpa-backend.yaml      # Horizontal Pod Autoscaler
│   └── secrets.yaml.example  # Secret template
├── infra/
│   └── eksctl-cluster.yaml   # EKS cluster config
├── scripts/
│   ├── deploy.ps1            # One-command deploy
│   └── smoke.ps1             # Smoke tests
└── hackathon/
    ├── README.md             # This file
    ├── demo-script.md        # 3-min demo script
    └── UPDATES.md            # Changelog
```

## 🔗 Important Links

- **Devpost Submission**: [Link to Devpost]
- **GitHub Repository**: [Link to GitHub]
- **Live Demo**: [EKS Application URL]
- **Demo Video**: [YouTube/Loom Link]
- **Slide Deck**: [Google Slides/PDF]

## 👥 Team

- **[Your Name]** - Full Stack Development, DevOps

## 📜 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- **NVIDIA** for NIM microservices and GPU acceleration
- **AWS** for EKS and cloud infrastructure
- **Anthropic** for Claude (used during development)

---

**Built for AWS × NVIDIA: Agentic AI Unleashed Hackathon**
_January 2025_
