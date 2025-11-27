# 🎬 AI Finance Agent - 3-Minute Demo Script

## Setup (Before Recording)

- [ ] EKS cluster running with all pods healthy
- [ ] Sample data loaded (transactions, budgets, 1-2 documents in RAG)
- [ ] Browser windows ready:
  - Tab 1: Finance Agent dashboard
  - Tab 2: Kubernetes dashboard / kubectl terminal
  - Tab 3: Code editor showing key files
- [ ] Rehearse timing: 30s per section
- [ ] Test screen recording (1080p, 30fps recommended)

---

## 🎯 [0:00-0:30] HOOK & PROBLEM (30 seconds)

### Visual: Dashboard with budget cards showing alerts

**Script**:

> "Personal finance apps show you data, but they don't _help_ you. You're left staring at charts wondering: Am I overspending? Should I worry about this charge? What should I do next?
>
> Today I'll show you an AI agent that doesn't just display numbers—it _proactively guides_ you using NVIDIA NIM microservices deployed on AWS EKS."

### Actions:

1. Show dashboard (0:05)
2. Hover over budget cards showing 90%, 85% usage (0:10)
3. Click "What should I do?" button (0:15)
4. Show next-best-actions list appearing (0:20)

### Key Visual: Red/orange budget alerts, loading spinner → action items

---

## 💡 [0:30-1:00] SOLUTION OVERVIEW (30 seconds)

### Visual: Architecture diagram or split screen (code + K8s)

**Script**:

> "This agent uses two NVIDIA NIM microservices:
>
> **First**, NIM LLM with Llama 3.1 Nemotron—it generates natural language explanations and suggestions in under 500 milliseconds.
>
> **Second**, NIM Embedding with nv-embed-v2—it powers a RAG system that searches your financial knowledge base using 768-dimensional vectors.
>
> Everything runs on AWS EKS with GPU-accelerated nodes for real-time inference."

### Actions:

1. Show architecture diagram (0:35)
2. Highlight NIM LLM box (0:40)
3. Highlight NIM Embed box + pgvector (0:45)
4. Quick pan to K8s dashboard showing GPU pods (0:55)

### Key Visual: Architecture flow, GPU node with green checkmarks

---

## 🚀 [1:00-1:30] DEMO - Proactive Alerts (30 seconds)

### Visual: Dashboard → Card explanation modal

**Script**:

> "Let's see it in action. I'm at 90% of my groceries budget. Instead of just showing a number, the agent _explains_ what's happening.
>
> I click 'Explain this card' and in milliseconds, it searches my financial documents using NIM embeddings, finds relevant context, and uses the NIM LLM to generate a personalized explanation with next steps.
>
> It even prioritizes my actions: Budget alerts come first, then anomalies, then suggestions."

### Actions:

1. Click "Explain this card" on groceries (1:05)
2. Show loading (with "Searching knowledge base..." text) (1:08)
3. Modal appears with:
   - Explanation paragraph (1:12)
   - Sources: "Budget Planning Guide.pdf" (1:18)
   - Next actions: "Consider meal planning" (1:22)

### Key Visual: Modal with explanation, sources, action buttons

---

## 📚 [1:30-2:00] DEMO - RAG System (30 seconds)

### Visual: RAG ingestion → Search results

**Script**:

> "The RAG system is pre-loaded with financial guides. Let me ask a question: 'How much should I contribute to my 401k?'
>
> Behind the scenes, NIM Embedding converts my question into a 768-dim vector, searches the pgvector database with HNSW indexing in under 50 milliseconds, and retrieves the top 3 relevant chunks.
>
> NIM LLM then synthesizes an answer with citations. All of this—embedding, search, generation—happens in real-time."

### Actions:

1. Type in search: "401k contribution" (1:35)
2. Hit enter, show loading (1:38)
3. Results appear:
   - Answer summary at top (1:42)
   - 3 source chunks with scores (1:48)
   - "Learn more" links (1:55)

### Key Visual: Search bar → Spinner → Results with similarity scores

---

## 🔍 [2:00-2:30] DEMO - Anomaly Detection (30 seconds)

### Visual: Transactions list with flagged item

**Script**:

> "Now anomaly detection. This $450 restaurant charge is flagged because it's 3x my average.
>
> The agent uses NIM LLM to explain _why_ it's unusual: 'Your typical restaurant spend is $150. This charge exceeds that by 300%.'
>
> It suggests two actions: Mark as one-time event, or update my budget if this is a new pattern. That's true agentic behavior—understanding context and recommending next steps."

### Actions:

1. Scroll to transactions list (2:05)
2. Click on flagged transaction ($450 restaurant) (2:10)
3. Show detail panel with:
   - "Unusual spending detected" badge (2:15)
   - LLM explanation (2:18)
   - Two action buttons (2:22)

### Key Visual: Red flag icon → Detail panel with explanation + buttons

---

## 🎯 [2:30-3:00] DEPLOYMENT & WRAP-UP (30 seconds)

### Visual: Terminal with deploy.ps1 + K8s dashboard

**Script**:

> "And the best part? One command deploys this entire stack:
>
> `deploy.ps1` creates an EKS cluster, provisions GPU nodes, deploys NIM microservices, the FastAPI backend, React frontend, and PostgreSQL with pgvector—all in about 20 minutes.
>
> You get horizontal pod autoscaling, health checks, and ALB ingress out of the box. This is production-ready agentic AI, powered by NVIDIA NIM and AWS EKS.
>
> Code is open source, MIT licensed. Thank you!"

### Actions:

1. Show `.\scripts\deploy.ps1` command (2:35)
2. Fast-forward animation of terminal output (2:40)
3. Pan to K8s dashboard showing:
   - 7 green pods (2:48)
   - GPU utilization graph (2:52)
   - Ingress URL (2:55)
4. End screen with GitHub link (2:58)

### Key Visual: Terminal → K8s dashboard → End card

---

## 🎥 Recording Checklist

### Pre-Recording

- [ ] Clear browser cache for clean demo
- [ ] Close unnecessary tabs/apps
- [ ] Set browser zoom to 100%
- [ ] Use incognito/guest mode to hide personal data
- [ ] Test microphone levels (avoid distortion)
- [ ] Rehearse at least 2x to hit 3:00 timing

### During Recording

- [ ] Speak clearly and at moderate pace
- [ ] Pause 1-2s between sections for editing
- [ ] If mistake: pause, restart section (easier to edit)
- [ ] Keep mouse movements smooth (no shaking)
- [ ] Highlight important UI elements with cursor

### Post-Recording

- [ ] Trim dead air at start/end
- [ ] Add captions/subtitles (YouTube auto-caption, then refine)
- [ ] Add background music (low volume, no copyright issues)
- [ ] Add text overlays for key terms:
  - "NIM LLM: Llama 3.1 Nemotron"
  - "NIM Embed: nv-embed-v2 (768-dim)"
  - "Latency: <500ms"
- [ ] Export at 1080p, 30fps, H.264
- [ ] Upload to YouTube (unlisted or public)
- [ ] Add to Devpost submission

---

## 🗣️ Key Talking Points (Memorize These)

1. **Agentic behavior**: "Doesn't just show data—proactively guides you"
2. **Real-time**: "Under 500ms for LLM, under 50ms for embedding search"
3. **Production-ready**: "One command deploys GPU-accelerated stack to AWS EKS"
4. **NVIDIA NIM**: "Two microservices—LLM and Embedding—running on T4 GPUs"
5. **RAG**: "768-dim vectors + HNSW indexing + pgvector"

---

## 📊 Backup Slides (If Demo Fails)

If live demo has issues, have these slides ready:

1. **Architecture Diagram** (with latency numbers)
2. **Screenshot: Budget Alerts** (with action items)
3. **Screenshot: RAG Search Results** (with sources)
4. **Screenshot: Anomaly Detection** (with explanation)
5. **Screenshot: K8s Dashboard** (showing GPU pods)
6. **Code Snippet**: `apps/backend/app/providers/nim_llm.py` (showing NIM integration)

---

## 🎬 Example Opening Hook (Alternative)

**Version A (Problem-focused)**:

> "You're trying to save money, but your finance app just shows charts. No guidance. No insights. No help. That changes today."

**Version B (Tech-focused)**:

> "NVIDIA NIM lets you deploy production LLMs in minutes. Today I'll show you a real-world agentic AI system using NIM on AWS EKS."

**Version C (Impact-focused)**:

> "What if your finance app didn't wait for you to ask questions? What if it proactively told you when to act? That's what we built."

---

## ⏱️ Timing Breakdown

| Section           | Duration | Cumulative | Content                         |
| ----------------- | -------- | ---------- | ------------------------------- |
| Hook & Problem    | 30s      | 0:30       | Show alerts, explain pain point |
| Solution Overview | 30s      | 1:00       | Architecture + NIM services     |
| Demo: Alerts      | 30s      | 1:30       | Explain card feature            |
| Demo: RAG         | 30s      | 2:00       | Search + sources                |
| Demo: Anomaly     | 30s      | 2:30       | Flagged transaction             |
| Deploy & Wrap     | 30s      | 3:00       | One-command deploy + end        |

---

**Goal**: Judges should think _"I could build this with NIM"_ after watching!
