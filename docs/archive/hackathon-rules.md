# Agentic AI Unleashed: AWS × NVIDIA Hackathon Rules

## Event Overview

**Hackathon**: Agentic AI Unleashed
**Organizers**: AWS, NVIDIA
**Duration**: January 2025
**Theme**: Build production-ready agentic AI applications using NVIDIA NIM on AWS infrastructure

---

## Core Requirements

### 1. NVIDIA NIM Integration (MANDATORY)

- **Must use at least ONE NVIDIA NIM microservice**:
  - NIM LLM (e.g., Llama 3.1, Mistral, CodeLlama)
  - NIM Embedding (e.g., nv-embed-v2, nv-embedqa-e5-v5)
  - NIM Speech (e.g., Parakeet, Canary)
  - NIM Vision (e.g., ViT, CLIP)
- **Access**: NVIDIA NGC API key required (free tier available)
- **Documentation**: Must document which NIM services used and why

### 2. AWS Cloud Deployment (MANDATORY)

- **Must deploy on AWS infrastructure**:
  - AWS EKS (Elastic Kubernetes Service) - RECOMMENDED
  - AWS ECS (Elastic Container Service)
  - AWS Lambda (for serverless)
  - AWS EC2 (if custom orchestration needed)
- **Must use AWS services** (at least 2):
  - EKS, ECS, Lambda, EC2, RDS, DynamoDB, S3, etc.
- **Documentation**: Architecture diagram showing AWS services

### 3. Agentic AI Behavior (MANDATORY)

- **Agent must demonstrate autonomy**:
  - Proactive actions (not just reactive queries)
  - Multi-step reasoning
  - Tool/function calling
  - Memory/context management
- **Examples**:
  - ❌ BAD: Chatbot that answers questions
  - ✅ GOOD: Agent that monitors data and suggests actions
  - ✅ GOOD: Agent that plans tasks and executes them

### 4. Open Source License (MANDATORY)

- **Must include LICENSE file** (MIT, Apache 2.0, GPL, etc.)
- Code must be publicly accessible on GitHub
- Private repos = disqualification

### 5. One-Command Deploy (STRONGLY RECOMMENDED)

- **Script or tool** to deploy entire stack:
  - `./deploy.sh` or `deploy.ps1` or `make deploy`
  - Should handle: infrastructure, secrets, containers, networking
- **Documentation**: Clear setup instructions in README

---

## Judging Criteria (100 points)

### Innovation (25 points)

- Novel use of NVIDIA NIM
- Creative problem-solving
- Originality of idea
- "Wow" factor

### Technical Excellence (25 points)

- Code quality
- Architecture design
- Performance optimization
- Error handling & resilience

### AWS Integration (20 points)

- Effective use of AWS services
- Scalability & reliability
- Cost optimization
- Security best practices

### Completeness (15 points)

- Working demo
- Documentation quality
- One-command deploy
- Test coverage

### Demo Quality (15 points)

- Video clarity (max 3 minutes)
- Storytelling
- Live demo (if applicable)
- Visual appeal

---

## Submission Requirements

### GitHub Repository

- Public repo with clear README
- LICENSE file
- Architecture diagram
- Setup instructions
- .env.example (no secrets!)

### Devpost Submission

- Project title & tagline
- Description (500-2000 words)
- Technologies used (tags: AWS, NVIDIA, NIM, etc.)
- Demo video (YouTube/Loom, max 3 min)
- GitHub repo link
- Team members

### Demo Video (3 minutes max)

- **Must include**:
  - Problem statement (30s)
  - Solution overview (30s)
  - Live demo (90s)
  - Deployment walkthrough (30s)
- **Format**: 1080p, uploaded to YouTube/Loom
- **No longer than 3 minutes** (strict cutoff)

---

## Technical Constraints

### NVIDIA NIM

- **API Key**: Free tier available at https://org.ngc.nvidia.com/setup/api-key
- **Models**: Use any model from NGC catalog
- **Rate Limits**: Free tier = 1000 req/day (plan accordingly)
- **Latency**: Expect 100-500ms for inference
- **GPU**: NIM optimized for NVIDIA GPUs (T4, A10G, A100)

### AWS Credits

- **Provided**: $100 AWS credits per team (request via hackathon portal)
- **Usage**: EKS, EC2 (g4dn.xlarge for GPU), RDS, S3, etc.
- **Cost estimate**: ~$25-50 for 48h hackathon
- **Warning**: Clean up resources after! (Set billing alerts)

### Deployment

- **Must be cloud-deployed** (no localhost-only demos)
- Judges will test deploy script (so make it work!)
- Health checks & monitoring recommended

---

## Disqualification Criteria

### Automatic Disqualification

- ❌ No NVIDIA NIM usage
- ❌ No AWS deployment
- ❌ Missing LICENSE file
- ❌ Private GitHub repo
- ❌ Plagiarism or code theft
- ❌ NSFW or harmful content
- ❌ Submission after deadline

### Partial Credit Loss

- ⚠️ Broken deploy script (-10 points)
- ⚠️ No demo video (-15 points)
- ⚠️ Poor documentation (-10 points)
- ⚠️ Non-functional demo (-20 points)

---

## Recommended Tech Stack

### Compute

- **EKS** (Kubernetes) - Best for multi-service orchestration
- **g4dn.xlarge** - GPU instance for NIM (NVIDIA T4, $0.526/hr)
- **t3.medium** - CPU instance for backend ($0.0416/hr)

### Storage

- **RDS PostgreSQL** - Managed database
- **S3** - Object storage for documents/models
- **EBS gp3** - Persistent volumes

### Networking

- **ALB** - Application Load Balancer
- **Route53** - DNS (optional)
- **CloudFront** - CDN for frontend (optional)

### Observability

- **CloudWatch** - Logs & metrics
- **X-Ray** - Tracing (optional)
- **Prometheus** - Custom metrics (optional)

---

## Example Projects (Inspiration)

### ✅ Finance Agent with RAG

- NIM LLM for explanations
- NIM Embedding for semantic search
- PostgreSQL + pgvector for RAG
- EKS deployment with GPU nodes

### ✅ Code Review Agent

- NIM CodeLlama for code analysis
- GitHub webhook for PRs
- AWS Lambda for event processing
- ECS for agent orchestration

### ✅ Customer Support Agent

- NIM LLM for responses
- NIM Speech for voice input
- DynamoDB for conversation history
- EKS + HPA for scaling

---

## Resources

### NVIDIA NIM

- **Docs**: https://docs.nvidia.com/nim/
- **NGC Catalog**: https://catalog.ngc.nvidia.com/
- **API Key**: https://org.ngc.nvidia.com/setup/api-key
- **Examples**: https://github.com/nvidia/nim-deploy

### AWS

- **EKS Guide**: https://docs.aws.amazon.com/eks/
- **eksctl**: https://eksctl.io/
- **GPU AMI**: https://aws.amazon.com/ec2/instance-types/g4/
- **Credits**: Request via hackathon portal

### Tools

- **Docker**: https://www.docker.com/
- **Kubernetes**: https://kubernetes.io/
- **Helm**: https://helm.sh/
- **kubectl**: https://kubernetes.io/docs/tasks/tools/

---

## Timeline

### Week 1 (Ideation)

- [x] Read hackathon rules
- [x] Get NVIDIA NGC API key
- [x] Request AWS credits
- [x] Set up development environment
- [x] Prototype locally

### Week 2 (Development)

- [x] Build core functionality
- [x] Integrate NVIDIA NIM
- [x] Write Kubernetes manifests
- [x] Test deployment script

### Week 3 (Polish & Submit)

- [x] Record demo video
- [x] Write documentation
- [x] Deploy to AWS EKS
- [x] Test smoke tests
- [x] Submit to Devpost

---

## FAQ

**Q: Can I use OpenAI/Anthropic instead of NVIDIA NIM?**
A: No, NVIDIA NIM is mandatory. You can use other LLMs for dev, but prod must use NIM.

**Q: Can I deploy on GCP or Azure?**
A: No, AWS deployment is mandatory.

**Q: Do I need a custom domain?**
A: No, ALB hostname is fine (e.g., `abc123.us-west-2.elb.amazonaws.com`)

**Q: Can I use pre-built components?**
A: Yes, but clearly document what you built vs. what's open source.

**Q: What if I run out of AWS credits?**
A: Request more via hackathon portal, or use local dev + deploy for demo only.

**Q: How many team members allowed?**
A: Solo or teams of up to 4 people.

---

**Last Updated**: January 2025
**Official Rules**: [Link to hackathon website]
