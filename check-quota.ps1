# Quick GPU Quota Status Check
# Run this every 15 minutes to monitor approval

$env:Path += ";C:\Program Files\Amazon\AWSCLIV2"
$Env:AWS_PROFILE = "lm-admin"
$Env:AWS_REGION = "us-west-2"

Write-Host "`n========== GPU QUOTA STATUS ==========`n" -ForegroundColor Cyan

# Check request status
$request = aws service-quotas get-requested-service-quota-change `
    --request-id 934bcaffd899444ea14720802907d2d8ZffZlCPY `
    --output json | ConvertFrom-Json

$status = $request.RequestedQuota.Status
$created = $request.RequestedQuota.Created
$elapsed = (Get-Date) - [DateTime]$created
$elapsedMin = [Math]::Floor($elapsed.TotalMinutes)

Write-Host "Request ID: 934bcaffd899444ea14720802907d2d8ZffZlCPY" -ForegroundColor White
Write-Host "Status: $status" -ForegroundColor $(if ($status -eq "APPROVED") { "Green" } elseif ($status -eq "DENIED") { "Red" } else { "Yellow" })
Write-Host "Created: $created" -ForegroundColor Gray
Write-Host "Elapsed: $elapsedMin minutes" -ForegroundColor Gray

if ($status -eq "APPROVED") {
    Write-Host "`n✅ QUOTA APPROVED! Checking GPU nodegroup..." -ForegroundColor Green

    # Check current quota value
    $currentQuota = aws service-quotas get-service-quota `
        --service-code ec2 `
        --quota-code L-DB2E81BA `
        --query "Quota.Value" `
        --output text

    Write-Host "Current G/VT vCPU quota: $currentQuota" -ForegroundColor Green

    # Check nodegroup status
    $nodegroup = aws eks describe-nodegroup `
        --cluster-name ledgermind-gpu `
        --nodegroup-name gpu-workers-paid `
        --query "nodegroup.{Status:status,Desired:scalingConfig.desiredSize}" `
        --output json | ConvertFrom-Json

    Write-Host "Nodegroup status: $($nodegroup.Status)" -ForegroundColor White
    Write-Host "Desired nodes: $($nodegroup.Desired)" -ForegroundColor White

    # Check if GPU node joined
    Write-Host "`nNodes in cluster:" -ForegroundColor Cyan
    kubectl get nodes -o wide

    Write-Host "`nNIM pods status:" -ForegroundColor Cyan
    kubectl get pods -n nim -o wide

    Write-Host "`n🚀 NEXT STEPS:" -ForegroundColor Green
    Write-Host "1. Wait for GPU node to join (3-5 min)"
    Write-Host "2. Watch NIM pods: kubectl get pods -n nim -w"
    Write-Host "3. Check logs: kubectl logs -n nim deployment/nim-llm"
    Write-Host "4. Port-forward: kubectl port-forward -n nim svc/nim-llm-svc 8008:8000"
    Write-Host "5. Test: curl http://localhost:8008/v1/models"

}
elseif ($status -eq "DENIED") {
    Write-Host "`n❌ QUOTA DENIED!" -ForegroundColor Red
    Write-Host "Actions:" -ForegroundColor Yellow
    Write-Host "1. Check your email for AWS response"
    Write-Host "2. Open AWS Support case with hackathon context"
    Write-Host "3. Or use Option B/C from NEXT_STEPS.md (CPU-based demo)"

}
else {
    Write-Host "`n⏳ Still pending... (typical: 15-120 min)" -ForegroundColor Yellow
    Write-Host "Next check in 15 minutes. You can:" -ForegroundColor Gray
    Write-Host "- Develop locally with Ollama (see NEXT_STEPS.md)"
    Write-Host "- Prepare demo materials"
    Write-Host "- Update GitHub README"
    Write-Host "`nTo expedite, open AWS Support case (see GPU_QUOTA_STATUS.md)"
}

Write-Host "`n======================================`n" -ForegroundColor Cyan
