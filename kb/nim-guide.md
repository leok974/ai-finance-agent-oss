# NVIDIA NIM Setup & Integration Guide

## What is NVIDIA NIM?

**NVIDIA NIM (NVIDIA Inference Microservices)** are containerized inference engines optimized for NVIDIA GPUs. They provide:

- **Optimized models**: Pre-tuned for T4, A10G, A100 GPUs
- **OpenAI-compatible API**: Drop-in replacement for OpenAI clients
- **Fast inference**: 2-10x faster than CPU-based inference
- **Easy deployment**: Docker containers, Kubernetes ready

---

## Available NIM Services

### NIM LLM (Language Models)

- `meta/llama-3.1-nemotron-nano-8b-v1` - 8B params, optimized for T4
- `meta/llama-3.1-70b-instruct` - 70B params, requires A100
- `mistralai/mistral-7b-instruct-v0.3` - 7B params, fast inference
- `meta/codellama-34b-instruct` - Code generation

### NIM Embedding (Vector Models)

- `nvidia/nv-embed-v2` - 768-dim, general purpose
- `nvidia/nv-embedqa-e5-v5` - 1024-dim, Q&A optimized
- `nvidia/nv-embed-mistral` - 4096-dim, long context

### NIM Speech

- `nvidia/parakeet-tdt-1.1b` - Speech-to-text
- `nvidia/canary-1b` - Multilingual transcription

### NIM Vision

- `nvidia/vit-base-patch16-224` - Image classification
- `nvidia/clip-vit-large-patch14` - Image+text embeddings

---

## Getting an NGC API Key

### Step 1: Create NVIDIA Account

1. Go to https://www.nvidia.com/en-us/account/
2. Sign up (free)
3. Verify email

### Step 2: Generate API Key

1. Go to https://org.ngc.nvidia.com/setup/api-key
2. Click **"Generate API Key"**
3. Copy the key (looks like `nvapi-abc123...`)
4. ⚠️ **Save it securely** (you can't view it again!)

### Step 3: Test API Key

```bash
curl -X POST "https://integrate.api.nvidia.com/v1/chat/completions" \
  -H "Authorization: Bearer nvapi-YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta/llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 50
  }'
```

---

## Deployment Options

### Option 1: NVIDIA Hosted (Easiest)

**URL**: `https://integrate.api.nvidia.com/v1`
**Pros**:

- No infrastructure setup
- Free tier available (1000 req/day)
- Low latency (~200-500ms)

**Cons**:

- Rate limits
- Data leaves your network
- Limited model customization

**Use case**: Development, prototyping, low-volume apps

### Option 2: Self-Hosted on EKS (Recommended for Hackathon)

**URL**: `http://nim-llm-service:8000/v1` (internal)
**Pros**:

- Full control
- No rate limits
- Data stays in your VPC
- GPU acceleration

**Cons**:

- Requires GPU nodes (g4dn.xlarge = $0.526/hr)
- Setup complexity
- Model download time (~5-10 min)

**Use case**: Production, high-volume, data privacy

### Option 3: Self-Hosted on EC2

**URL**: `http://YOUR_EC2_IP:8000/v1`
**Pros**:

- Simple setup (no Kubernetes)
- Full control

**Cons**:

- No autoscaling
- Manual management
- Still need GPU instance

**Use case**: Single-service apps, quick tests

---

## EKS Deployment Guide

### Prerequisites

```bash
# Install tools
brew install awscli eksctl kubectl helm  # macOS
choco install awscli eksctl kubernetes-cli  # Windows

# Configure AWS
aws configure

# Verify NGC API key
export NGC_API_KEY="nvapi-YOUR_KEY"
```

### Step 1: Create EKS Cluster with GPU Nodes

```yaml
# eksctl-cluster.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: nim-cluster
  region: us-west-2
managedNodeGroups:
  - name: gpu-workers
    instanceType: g4dn.xlarge
    desiredCapacity: 1
    minSize: 1
    maxSize: 3
    labels:
      nvidia.com/gpu: "true"
```

```bash
eksctl create cluster -f eksctl-cluster.yaml
# ⏱️ ~15 minutes
```

### Step 2: Install NVIDIA Device Plugin

```bash
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.0/nvidia-device-plugin.yml
```

### Step 3: Create Secret for NGC API Key

```bash
kubectl create secret generic nim-secrets \
  --from-literal=ngc-api-key="$NGC_API_KEY"
```

### Step 4: Deploy NIM LLM

```yaml
# nim-llm-deploy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nim-llm
spec:
  replicas: 1
  template:
    spec:
      nodeSelector:
        nvidia.com/gpu: "true"
      containers:
        - name: nim-llm
          image: nvcr.io/nvidia/nim/meta/llama-3.1-nemotron-nano-8b-v1:latest
          env:
            - name: NGC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: nim-secrets
                  key: ngc-api-key
          resources:
            limits:
              nvidia.com/gpu: 1
          ports:
            - containerPort: 8000
---
apiVersion: v1
kind: Service
metadata:
  name: nim-llm-service
spec:
  selector:
    app: nim-llm
  ports:
    - port: 8000
```

```bash
kubectl apply -f nim-llm-deploy.yaml
kubectl wait --for=condition=available deployment/nim-llm --timeout=600s
```

### Step 5: Test NIM Service

```bash
kubectl port-forward svc/nim-llm-service 8000:8000

curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta/llama-3.1-nemotron-nano-8b-v1",
    "messages": [{"role": "user", "content": "Explain RAG in 1 sentence"}],
    "max_tokens": 50
  }'
```

---

## Python Client Integration

### Using OpenAI Library (Easiest)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://nim-llm-service:8000/v1",
    api_key="not-needed-for-self-hosted"
)

response = client.chat.completions.create(
    model="meta/llama-3.1-nemotron-nano-8b-v1",
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=0.7,
    max_tokens=100
)

print(response.choices[0].message.content)
```

### Using httpx (More Control)

```python
import httpx

async def chat(prompt: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://nim-llm-service:8000/v1/chat/completions",
            json={
                "model": "meta/llama-3.1-nemotron-nano-8b-v1",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 150
            },
            timeout=30.0
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
```

---

## NIM Embedding Integration

### Deploy NIM Embedding

```yaml
# nim-embed-deploy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nim-embed
spec:
  replicas: 1
  template:
    spec:
      nodeSelector:
        nvidia.com/gpu: "true"
      containers:
        - name: nim-embed
          image: nvcr.io/nvidia/nim/nvidia/nv-embedqa-e5-v5:latest
          env:
            - name: NGC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: nim-secrets
                  key: ngc-api-key
          resources:
            limits:
              nvidia.com/gpu: 1
          ports:
            - containerPort: 8001
---
apiVersion: v1
kind: Service
metadata:
  name: nim-embed-service
spec:
  selector:
    app: nim-embed
  ports:
    - port: 8001
```

### Python Client

```python
import httpx
import numpy as np

async def embed_texts(texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://nim-embed-service:8001/v1/embeddings",
            json={
                "model": "nvidia/nv-embed-v2",
                "input": texts,
                "encoding_format": "float"
            },
            timeout=30.0
        )
        response.raise_for_status()
        data = response.json()

        # Extract embeddings and normalize
        embeddings = [item["embedding"] for item in data["data"]]
        normalized = [
            (np.array(e) / np.linalg.norm(e)).tolist()
            for e in embeddings
        ]
        return normalized
```

---

## Performance Tuning

### Batch Requests

```python
# ❌ BAD: Sequential requests
for text in texts:
    embed = await embed_texts([text])

# ✅ GOOD: Batch request
embeddings = await embed_texts(texts)  # Up to 64 at once
```

### Request Pooling

```python
import asyncio

# ✅ GOOD: Concurrent requests
tasks = [chat(prompt) for prompt in prompts]
responses = await asyncio.gather(*tasks)  # Up to 10 concurrent
```

### Model Caching

- First request: ~5-10s (model load)
- Subsequent requests: ~200-500ms
- Keep pods warm with health checks

### GPU Utilization

```bash
# Check GPU usage
kubectl exec -it nim-llm-POD -- nvidia-smi

# Optimize batch size
# T4 (16GB): batch=8-16
# A10G (24GB): batch=16-32
```

---

## Troubleshooting

### Issue: Pod stuck in "Pending"

**Cause**: No GPU nodes available
**Fix**:

```bash
kubectl describe node | grep nvidia.com/gpu
# Should show: nvidia.com/gpu: 1

# If missing, check node group
eksctl get nodegroup --cluster=nim-cluster
```

### Issue: "Out of memory" error

**Cause**: Model too large for GPU
**Fix**:

- Use smaller model (e.g., `llama-3.1-8b` instead of `llama-3.1-70b`)
- Reduce batch size
- Upgrade to g4dn.2xlarge (32GB)

### Issue: Slow inference (>2s)

**Cause**: Cold start or CPU fallback
**Fix**:

```bash
# Verify GPU is being used
kubectl logs nim-llm-POD | grep GPU
# Should see: "Using GPU: NVIDIA T4"

# Check resource limits
kubectl describe pod nim-llm-POD | grep Limits
# Should show: nvidia.com/gpu: 1
```

### Issue: "NGC API key invalid"

**Cause**: Expired or wrong key
**Fix**:

1. Regenerate at https://org.ngc.nvidia.com/setup/api-key
2. Update secret:

```bash
kubectl delete secret nim-secrets
kubectl create secret generic nim-secrets --from-literal=ngc-api-key="NEW_KEY"
kubectl rollout restart deployment/nim-llm
```

---

## Cost Optimization

### Use Spot Instances

```yaml
# eksctl-cluster.yaml
managedNodeGroups:
  - name: gpu-workers-spot
    instanceTypes: ["g4dn.xlarge", "g4dn.2xlarge"]
    spot: true # 70% cheaper!
```

### Auto-Scaling

```yaml
# hpa-nim.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nim-llm-hpa
spec:
  scaleTargetRef:
    kind: Deployment
    name: nim-llm
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: nvidia.com/gpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Scheduled Scaling

```bash
# Scale down during off-hours
kubectl scale deployment/nim-llm --replicas=0

# Scale up for demo
kubectl scale deployment/nim-llm --replicas=1
```

---

## Next Steps

1. **Test locally**: Use NVIDIA hosted API first
2. **Deploy to EKS**: Follow guide above
3. **Integrate**: Use Python client in your app
4. **Monitor**: Set up CloudWatch dashboards
5. **Optimize**: Profile latency, tune batch sizes
6. **Scale**: Add HPA, use spot instances

---

## Resources

- **NIM Docs**: https://docs.nvidia.com/nim/
- **NGC Catalog**: https://catalog.ngc.nvidia.com/
- **GitHub Examples**: https://github.com/nvidia/nim-deploy
- **AWS GPU Guide**: https://docs.aws.amazon.com/eks/latest/userguide/gpu-ami.html
- **Troubleshooting**: https://docs.nvidia.com/nim/troubleshooting.html

---

**Last Updated**: January 2025
**Questions?**: Post in hackathon Slack channel
