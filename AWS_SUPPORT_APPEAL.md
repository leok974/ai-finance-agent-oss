# AWS Support Case: GPU Quota Request for Hackathon

**Date:** November 2, 2025
**Account:** 103102677735 (lm-admin)
**Region:** us-west-2
**Quota Request ID:** 934bcaffd899444ea14720802907d2d8ZffZlCPY

---

## Subject

**Request minimal GPU quota for AWS × NVIDIA Hackathon (g5.xlarge, 4 vCPUs, time-boxed)**

---

## Message Body

Hello AWS Support,

I'm participating in the **Agentic AI Unleashed: AWS & NVIDIA Hackathon** (deadline **Nov 3, 2025 2:00 PM ET**).

I need to run two NVIDIA NIM microservices (LLM: `meta/llama-3.1-nemotron-nano-8B-v1`, and a Retrieval Embedding NIM) on Amazon EKS to satisfy the hackathon requirements.

### Request

Please increase EC2 quota **"Running On-Demand G and VT instances"** (code `L-DB2E81BA`) in `us-west-2` from **0 to 4 vCPUs** so I can launch **one g5.xlarge worker node** for a short, supervised demo window.

### Controls & Guardrails

1. **EKS GPU nodegroup configuration:**

   - `minSize: 0`, `maxSize: 1`, `desiredCapacity: 0` (default)
   - Scale to 1 only during demos; otherwise 0 (no idle cost)
   - Cluster: `ledgermind-gpu` in `us-west-2`

2. **Budget & Alerts:**

   - Monthly budget set to $25 with 80%/100% alerts to `leoklemet.pa@gmail.com`
   - Expected usage: 2-3 hours total (~$3)
   - Automatic teardown checklist after demo completion

3. **Monitoring:**

   - CloudWatch alarms configured
   - Manual verification via `eksctl get nodegroup` before shutdown
   - Documented teardown procedure: `eksctl delete cluster --name ledgermind-gpu`

4. **Data & Security:**
   - Non-sensitive demo data only (synthetic financial transactions)
   - No PII or production data
   - Educational use case only

### Account Details

- **Account ID:** 103102677735
- **IAM User:** lm-admin
- **Cluster:** ledgermind-gpu (us-west-2, ACTIVE)
- **Instance:** g5.xlarge only (4 vCPUs, NVIDIA A10G)
- **Current quota:** 0 vCPUs (blocking deployment)

### Alternative Request (if On-Demand is restricted)

If On-Demand quota cannot be approved, please consider increasing **"All G and VT Spot Instance Requests"** (code `L-3819A6DF`) to 4 vCPUs instead. I can use Spot instances with the same cost controls.

### Context

This is the **smallest viable quota** for a **time-boxed educational event** with strict cost controls. The hackathon emphasizes AWS + NVIDIA collaboration, and I've already:

- Built a complete EKS cluster with CPU nodes (ACTIVE)
- Implemented NVIDIA NIM adapters in my codebase
- Created comprehensive deployment automation
- Set up budget alerts and monitoring

I only need GPU access for 2-3 hours to complete the demo recording and meet the hackathon submission deadline.

### Submitted Quota Request

- **Request ID:** 934bcaffd899444ea14720802907d2d8ZffZlCPY
- **Status:** PENDING (submitted Nov 2, 2025 6:52 PM EST)
- **Requested value:** 4 vCPUs
- **Current value:** 0 vCPUs

I'm requesting **expedited review** due to the Nov 3 hackathon deadline.

Thank you for reconsidering this minimal, time-boxed, and cost-controlled request!

Best regards,
Leo Klement
leoklemet.pa@gmail.com

---

## How to Submit

### Option 1: AWS Support Console (RECOMMENDED)

1. Go to: https://console.aws.amazon.com/support/home
2. Click **"Create case"**
3. Select **"Service limit increase"**
4. Fill in:
   - **Service:** EC2 Instances
   - **Category:** EC2 Instances
   - **Severity:** General guidance (faster than "System impaired")
   - **Subject:** Copy from above
   - **Description:** Copy message body above
   - **Region:** us-west-2
   - **Quota:** Running On-Demand G and VT instances
   - **New limit:** 4
   - **Use case:** Copy context section above
5. Click **"Submit"**

### Option 2: AWS CLI

```powershell
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$env:AWS_PROFILE="lm-admin"

# Create support case (requires Support API access)
aws support create-case `
  --subject "Request minimal GPU quota for AWS × NVIDIA Hackathon (g5.xlarge, 4 vCPUs)" `
  --service-code "service-limit-increase" `
  --severity-code "low" `
  --category-code "ec2-instance-limit-increase" `
  --communication-body "$(Get-Content C:\ai-finance-agent-oss-clean\AWS_SUPPORT_APPEAL.md -Raw)"
```

### Option 3: Re-submit Quota Request with Justification

```powershell
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$env:AWS_PROFILE="lm-admin"

aws service-quotas request-service-quota-increase `
  --service-code ec2 `
  --quota-code L-DB2E81BA `
  --desired-value 4 `
  --region us-west-2 `
  --quota-context "Educational use: AWS × NVIDIA Hackathon (deadline Nov 3). Need 1x g5.xlarge for 2-3 hours demo. Strict cost controls: minSize=0, maxSize=1, budget alerts, manual teardown."
```

---

## Expected Timeline

- **Auto-approval:** 15 minutes - 2 hours (if system allows)
- **Manual review:** 2-24 hours (if flagged)
- **Escalated:** 24-48 hours (if support case opened)

## Monitoring Approval

```powershell
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$env:AWS_PROFILE="lm-admin"

# Check quota request status
aws service-quotas get-requested-service-quota-change `
  --request-id 934bcaffd899444ea14720802907d2d8ZffZlCPY `
  --region us-west-2 `
  --query "RequestedQuota.{Status:Status,Updated:LastUpdated}"

# Check current quota value
aws service-quotas get-service-quota `
  --service-code ec2 `
  --quota-code L-DB2E81BA `
  --query "Quota.{Name:QuotaName,Value:Value}"
```

---

## If Denied: Spot Alternative

If On-Demand is denied, request Spot quota instead:

```powershell
aws service-quotas request-service-quota-increase `
  --service-code ec2 `
  --quota-code L-3819A6DF `
  --desired-value 4 `
  --region us-west-2
```

Then deploy Spot GPU nodegroup:

```powershell
@"
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: ledgermind-gpu
  region: us-west-2
managedNodeGroups:
  - name: gpu-spot
    instanceTypes: ["g5.xlarge"]
    desiredCapacity: 1
    minSize: 0
    maxSize: 1
    spot: true
    privateNetworking: true
    labels: { nodeclass: gpu, capacity: spot }
    taints:
      - key: "nvidia.com/gpu"
        value: "present"
        effect: "NoSchedule"
"@ | Out-File -Encoding ascii C:\ai-finance-agent-oss-clean\eks-gpu-spot.yaml

eksctl create nodegroup -f C:\ai-finance-agent-oss-clean\eks-gpu-spot.yaml
```

---

## Current Findings

### Global GPU Quota Scan Results

- **All AWS regions scanned:** 0 vCPUs GPU quota available
- **On-Demand G/VT (L-DB2E81BA):** 0 vCPUs (all regions)
- **Spot G/VT (L-3819A6DF):** 0 vCPUs (all regions)
- **Conclusion:** Account has global GPU restriction (likely new Free Tier account)

### Current EKS Cluster Status

- ✅ Control plane: ACTIVE
- ✅ sys-cpu nodegroup: 2x t3.micro (Free Tier) ACTIVE
- ❌ GPU nodegroup: BLOCKED (0 vCPU quota)
- ⚠️ t3.micro limits: 4 pods max per node (ENI constraint)

### Workarounds Attempted

1. ❌ g4dn.xlarge (Free Tier error)
2. ❌ t3.medium (Free Tier error)
3. ✅ t3.micro (working, but 4-pod limit)
4. ❌ g5.xlarge On-Demand (0 quota)
5. ❌ g5.xlarge Spot (0 quota)
6. ⏳ Multi-region scan (no quota anywhere)

---

## Immediate Fallback Plan

While waiting for quota approval, you can:

### 1. Complete Backend Development Locally

```powershell
cd C:\ai-finance-agent-oss-clean\apps\backend
$env:DEFAULT_LLM_PROVIDER="ollama"
$env:OLLAMA_BASE_URL="http://localhost:11434"
python -m uvicorn app.main:app --reload --port 8000
```

### 2. Prepare Demo Materials

- Architecture diagram
- Demo script refinement
- GitHub README update
- Record local demo (swap to EKS when GPU approved)

### 3. Document "EKS-Ready" State

- Show cluster is ACTIVE
- Show NIM deployment YAMLs ready
- Show GPU nodegroup config prepared
- Explain quota blocker in submission

### 4. Alternative Demo Path

If quota is not approved by deadline:

- Demo locally with Ollama (CPU-based)
- Show EKS infrastructure (CPU nodes working)
- Document NIM integration code
- Include note: "GPU deployment blocked by AWS quota, code ready to deploy"

---

## Cost Tracking

### Current: $0/hour

- t3.micro x2: Free Tier ($0)
- EKS control plane: Free Tier ($0, first 750 hours)

### After GPU approval: ~$1.01/hour

- g5.xlarge: $1.006/hour
- Expected usage: 2-3 hours = $2-3 total
- Budget alert at $20 (80% of $25)

### Teardown Command

```powershell
eksctl delete cluster --name ledgermind-gpu --region us-west-2
```

---

## References

- **Hackathon:** https://awsxnvidia.devpost.com/
- **Deadline:** Nov 3, 2025 2:00 PM ET
- **EKS Console:** https://console.aws.amazon.com/eks/home?region=us-west-2#/clusters/ledgermind-gpu
- **Quota Console:** https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-DB2E81BA
- **Support:** https://console.aws.amazon.com/support/home

---

**Status:** GPU quota request pending. Backup plans prepared. Cluster operational (CPU-only).
