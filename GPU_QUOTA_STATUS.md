# GPU Quota Request Status

**Created:** November 2, 2025 6:52 PM EST
**Request ID:** `934bcaffd899444ea14720802907d2d8ZffZlCPY`
**Status:** ⏳ **PENDING**

## Summary

AWS Service Quotas request submitted to enable g5.xlarge GPU instances for NVIDIA NIM deployment.

### Quota Details

| Quota                                | Code       | Current     | Requested    | Status    |
| ------------------------------------ | ---------- | ----------- | ------------ | --------- |
| Running On-Demand G and VT instances | L-DB2E81BA | **0 vCPUs** | **4 vCPUs**  | PENDING   |
| Running On-Demand Standard instances | L-1216C47A | 8 vCPUs     | (sufficient) | ✅ Active |

### Why This Was Needed

**Root Cause:** New AWS Free Tier accounts have GPU instance quotas set to **0 vCPUs** by default.

**Error Message from ASG:**

```
Could not launch On-Demand Instances. InvalidParameterCombination -
The specified instance type is not eligible for Free Tier.
For a list of Free Tier instance types, run 'describe-instance-types'
with the filter 'free-tier-eligible=true'. Launching EC2 instance failed.
```

This misleading error actually means "GPU quota is 0" not "you must use Free Tier only."

### Instance Requirements

- **g5.xlarge**: 4 vCPUs (NVIDIA A10G, 24GB VRAM)
- **Requested quota**: 4 vCPUs (allows 1x g5.xlarge)
- **Cost**: ~$1.006/hour (~$0.02 for hackathon demo)

## Current Cluster State

### ✅ Active Resources

```
Cluster: ledgermind-gpu (us-west-2)
Control Plane: ACTIVE
Region: us-west-2
Version: 1.30
```

**Nodegroups:**

- ✅ **sys-cpu**: 1x t3.micro (Free Tier) - **ACTIVE**
  - CPU node ready and serving
  - Running system pods
- ⏸️ **gpu-workers-paid**: 0x g5.xlarge - **CREATING** (blocked)
  - Cannot launch due to 0 GPU quota
  - Will auto-deploy when quota approved

**Active Nodes:**

```
NAME                                         STATUS   AGE   VERSION
ip-192-168-6-78.us-west-2.compute.internal   Ready    26m   v1.30.14-eks-113cf36
```

### 🚀 Ready to Deploy (waiting for GPU)

**NIM Services** (deployed to `nim` namespace):

- `nim-llm` pod: **Pending** (needs nvidia.com/gpu: 1)
- `nim-embed` pod: **Pending** (needs nvidia.com/gpu: 1)

**NGC Registry Secret:** ✅ Created (`ngc-regcred`)

**NVIDIA Device Plugin:** ✅ Installed (DaemonSet ready)

## Timeline Expectations

### Typical AWS Quota Approval Times

- **Automatic approval**: 15 minutes - 2 hours (common for GPU quotas ≤32 vCPUs)
- **Manual review**: 2-24 hours (if flagged for verification)
- **Business days**: Monday-Friday, 9 AM - 5 PM Pacific

### You'll Receive

1. **Email notification** to AWS account root email
2. **Status visible** via:
   ```powershell
   aws service-quotas get-requested-service-quota-change `
     --request-id 934bcaffd899444ea14720802907d2d8ZffZlCPY `
     --region us-west-2
   ```

## When Quota is Approved ✅

### Automatic Steps (EKS will handle)

1. ✅ GPU quota changes from 0 → 4 vCPUs
2. ✅ ASG retry will succeed automatically
3. ✅ g5.xlarge instance launches (~3 min)
4. ✅ Node joins cluster with NVIDIA GPU
5. ✅ NIM pods schedule and pull images (~5-10 min for model download)

### Manual Verification (run these)

```powershell
# Set environment
$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$Env:AWS_PROFILE="lm-admin"
$Env:AWS_REGION="us-west-2"

# 1. Check quota approved
aws service-quotas get-service-quota `
  --service-code ec2 `
  --quota-code L-DB2E81BA `
  --query "Quota.{Name:QuotaName,Value:Value}" `
  --output table

# 2. Verify GPU node joined
kubectl get nodes -o wide

# 3. Check GPU device plugin
kubectl get pods -n kube-system -l name=nvidia-device-plugin-ds

# 4. Verify NIM pods running
kubectl get pods -n nim -o wide

# 5. Test GPU with nvidia-smi
kubectl run nvidia-smi --rm -it --restart=Never `
  --image=nvcr.io/nvidia/cuda:12.2.0-base-ubuntu22.04 `
  --overrides='{"spec":{"tolerations":[{"key":"nvidia.com/gpu","operator":"Exists","effect":"NoSchedule"}],"containers":[{"name":"cuda","image":"nvcr.io/nvidia/cuda:12.2.0-base-ubuntu22.04","command":["nvidia-smi"],"resources":{"limits":{"nvidia.com/gpu":"1"}}}]}}'

# 6. Check NIM LLM logs
kubectl logs -n nim deployment/nim-llm --tail=50
```

### Manual Scale-Up (if ASG didn't auto-retry)

If the ASG gave up after multiple failures, manually trigger:

```powershell
eksctl scale nodegroup `
  --cluster ledgermind-gpu `
  --name gpu-workers-paid `
  --nodes 1
```

## Immediate Next Steps (while waiting)

### Option A: Continue with CPU-only development ⚡

The NIM embedding service can run on CPU. Deploy modified version:

```powershell
# Scale NIM embed to run on CPU node (remove GPU requirement)
kubectl patch deployment nim-embed -n nim -p '{"spec":{"template":{"spec":{"tolerations":[],"containers":[{"name":"nim-embed","resources":{"limits":{"memory":"8Gi"},"requests":{"cpu":"2","memory":"4Gi"}}}]}}}}'

# Wait for pod to schedule
kubectl wait --for=condition=ready pod -l app=nim-embed -n nim --timeout=300s

# Port-forward for local testing
kubectl port-forward -n nim svc/nim-embed-svc 8081:8000
```

Then test embedding endpoint:

```powershell
curl http://localhost:8081/v1/embeddings `
  -H "Content-Type: application/json" `
  -d '{"input":"test financial document","model":"nvidia/nv-embed-v2"}'
```

### Option B: Use local NIM (Docker) 🐳

Run NIM LLM locally while GPU quota is pending:

```powershell
docker run -d --name nim-llm-local `
  -p 8008:8000 `
  -e NGC_API_KEY=OGdhMHVzc2I5M3YzbmFwdDJyc2dzcG5oYW86MzM3MjkwY2ItNDhlMC00OTc2LTgyY2EtOTM5NGIxYjM1M2Q2 `
  nvcr.io/nim/meta/llama-3.1-nemotron-nano-8b-v1:latest

# Update backend to point to localhost
$env:NIM_LLM_URL="http://localhost:8008"
$env:NIM_EMBED_URL="http://localhost:8081"  # if using k8s port-forward
```

### Option C: Accelerate approval 🚀

If urgent, contact AWS Support:

1. Open **AWS Support Center** (Console → Support)
2. Create case: **Service Limit Increase**
3. Subject: "Urgent GPU quota for AWS+NVIDIA Hackathon - Request 934bcaffd899444ea14720802907d2d8ZffZlCPY"
4. Description:

   ```
   I submitted a quota increase request for "Running On-Demand G and VT instances"
   (L-DB2E81BA) from 0 to 4 vCPUs in us-west-2.

   Request ID: 934bcaffd899444ea14720802907d2d8ZffZlCPY

   This is for the AWS × NVIDIA "Agentic AI Unleashed" hackathon (deadline Nov 3-4).
   I need to deploy NVIDIA NIM on EKS for a financial AI agent demo.

   Current usage: 0 GPU instances (new deployment)
   Requested: 1x g5.xlarge for ~2 hours of demo recording

   My payment method is valid. Can you please expedite this approval?
   ```

5. Severity: **General guidance** (faster than "System impaired")

## Cost Control 💰

### Current Spend: ~$0/hour

- t3.micro (Free Tier): $0
- EKS control plane (first cluster): $0 (Free Tier covers 750 hours/month)

### When GPU Launches: ~$1.01/hour

- g5.xlarge: $1.006/hour
- EBS gp3 100GB: $0.08/month (~$0.00011/hour)

**Hackathon budget for 2-hour demo:** ~$2.02

### Auto-shutdown Protection ✅

The GPU nodegroup is configured with:

- `desiredCapacity: 1` (only when quota approved)
- `minSize: 0` (can scale to zero)
- `maxSize: 1` (prevents runaway costs)

**To stop costs immediately after demo:**

```powershell
# Scale GPU nodegroup to zero
eksctl scale nodegroup --cluster ledgermind-gpu --name gpu-workers-paid --nodes 0

# Or delete entire cluster
eksctl delete cluster --name ledgermind-gpu --region us-west-2
```

## Troubleshooting

### If quota request is DENIED

Re-submit with justification:

```powershell
aws service-quotas request-service-quota-increase `
  --service-code ec2 `
  --quota-code L-DB2E81BA `
  --desired-value 4 `
  --region us-west-2 `
  --quota-context "Business justification: AWS+NVIDIA Hackathon demo deployment"
```

### If nodegroup stays in CREATING after approval

Delete and recreate:

```powershell
eksctl delete nodegroup --cluster ledgermind-gpu --name gpu-workers-paid
eksctl create nodegroup -f C:\ai-finance-agent-oss-clean\eks-gpu-paid.yaml
```

### If ASG shows different error after approval

Check latest scaling activity:

```powershell
$asg = (aws autoscaling describe-auto-scaling-groups --query "AutoScalingGroups[?contains(AutoScalingGroupName,'gpu-workers-paid')].AutoScalingGroupName" --output text)
aws autoscaling describe-scaling-activities --auto-scaling-group-name $asg --max-records 1
```

Common issues post-approval:

- **Insufficient capacity**: g5.xlarge not available in selected AZ
  - Fix: Update nodegroup to use different AZs
- **Launch template error**: Old template cached
  - Fix: Delete nodegroup, recreate (gets new launch template)

## Reference Links

- **Quota request**: https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-DB2E81BA
- **EKS console**: https://console.aws.amazon.com/eks/home?region=us-west-2#/clusters/ledgermind-gpu
- **Support cases**: https://console.aws.amazon.com/support/home

## Files Created/Modified

- ✅ `eks-gpu-paid.yaml` - GPU nodegroup config (g5.xlarge, desiredCapacity: 1)
- ✅ `k8s/nim-services.yaml` - NIM LLM + Embedding deployments
- ✅ `k8s/secrets.yaml` - NGC API key configured
- ✅ Backend NIM adapters (`nim_llm.py`, `nim_embed.py`)
- ✅ NVIDIA device plugin installed (DaemonSet)

Everything is ready to go live the moment the quota is approved! 🚀
