# AI Finance Agent - EKS Deployment Script
# Usage: .\scripts\deploy.ps1 [cluster-name]

param(
    [string]$ClusterName = "finance-agent-cluster",
    [string]$Region = "us-west-2",
    [switch]$SkipClusterCreation = $false,
    [switch]$SkipDockerBuild = $false
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 AI Finance Agent - EKS Deployment" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan

# Check prerequisites
Write-Host "`n📋 Checking prerequisites..." -ForegroundColor Yellow
$requiredTools = @("eksctl", "kubectl", "aws", "docker")
foreach ($tool in $requiredTools) {
    if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Error "❌ Required tool not found: $tool"
        Write-Host "Install from: https://docs.aws.amazon.com/eks/latest/userguide/getting-started.html"
        exit 1
    }
    Write-Host "  ✅ $tool" -ForegroundColor Green
}

# Verify AWS credentials
Write-Host "`n🔐 Verifying AWS credentials..." -ForegroundColor Yellow
try {
    aws sts get-caller-identity | Out-Null
    Write-Host "  ✅ AWS credentials valid" -ForegroundColor Green
}
catch {
    Write-Error "❌ AWS credentials not configured. Run: aws configure"
    exit 1
}

# Create EKS cluster
if (!$SkipClusterCreation) {
    Write-Host "`n☁️  Creating EKS cluster '$ClusterName'..." -ForegroundColor Yellow
    Write-Host "  ⏱️  This will take ~15-20 minutes..." -ForegroundColor DarkGray

    eksctl create cluster -f infra/eksctl-cluster.yaml

    if ($LASTEXITCODE -ne 0) {
        Write-Error "❌ Failed to create EKS cluster"
        exit 1
    }
    Write-Host "  ✅ Cluster created successfully" -ForegroundColor Green

    # Install NVIDIA device plugin for GPU support
    Write-Host "`n🎮 Installing NVIDIA device plugin..." -ForegroundColor Yellow
    kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.0/nvidia-device-plugin.yml
    Write-Host "  ✅ NVIDIA plugin installed" -ForegroundColor Green

    # Install AWS Load Balancer Controller
    Write-Host "`n⚖️  Installing AWS Load Balancer Controller..." -ForegroundColor Yellow
    eksctl create iamserviceaccount `
        --cluster=$ClusterName `
        --namespace=kube-system `
        --name=aws-load-balancer-controller `
        --role-name AmazonEKSLoadBalancerControllerRole `
        --attach-policy-arn=arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess `
        --approve `
        --region=$Region

    kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"

    helm repo add eks https://aws.github.io/eks-charts
    helm repo update
    helm install aws-load-balancer-controller eks/aws-load-balancer-controller `
        -n kube-system `
        --set clusterName=$ClusterName `
        --set serviceAccount.create=false `
        --set serviceAccount.name=aws-load-balancer-controller

    Write-Host "  ✅ ALB Controller installed" -ForegroundColor Green
}

# Build Docker images
if (!$SkipDockerBuild) {
    Write-Host "`n🐳 Building Docker images..." -ForegroundColor Yellow

    # Get ECR repository URIs (or create them)
    $accountId = (aws sts get-caller-identity --query Account --output text)
    $backendRepo = "$accountId.dkr.ecr.$Region.amazonaws.com/finance-agent-backend"
    $frontendRepo = "$accountId.dkr.ecr.$Region.amazonaws.com/finance-agent-frontend"

    # Login to ECR
    aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "$accountId.dkr.ecr.$Region.amazonaws.com"

    # Create ECR repos if they don't exist
    aws ecr create-repository --repository-name finance-agent-backend --region $Region 2>$null
    aws ecr create-repository --repository-name finance-agent-frontend --region $Region 2>$null

    # Build and push backend
    Write-Host "  Building backend..." -ForegroundColor DarkGray
    docker build -t finance-agent-backend:latest -f apps/backend/Dockerfile apps/backend
    docker tag finance-agent-backend:latest "$backendRepo:latest"
    docker push "$backendRepo:latest"

    # Build and push frontend
    Write-Host "  Building frontend..." -ForegroundColor DarkGray
    docker build -t finance-agent-frontend:latest -f apps/web/Dockerfile apps/web
    docker tag finance-agent-frontend:latest "$frontendRepo:latest"
    docker push "$frontendRepo:latest"

    Write-Host "  ✅ Images built and pushed" -ForegroundColor Green
}

# Create secrets
Write-Host "`n🔒 Creating Kubernetes secrets..." -ForegroundColor Yellow
if (Test-Path "k8s/secrets.yaml") {
    kubectl apply -f k8s/secrets.yaml
    Write-Host "  ✅ Secrets created" -ForegroundColor Green
}
else {
    Write-Host "  ⚠️  WARNING: k8s/secrets.yaml not found!" -ForegroundColor Red
    Write-Host "  Copy k8s/secrets.yaml.example to k8s/secrets.yaml and fill in values" -ForegroundColor Yellow
    $continue = Read-Host "Continue without secrets? (y/N)"
    if ($continue -ne "y") {
        exit 1
    }
}

# Deploy Kubernetes resources
Write-Host "`n📦 Deploying Kubernetes resources..." -ForegroundColor Yellow
$k8sFiles = @(
    "k8s/postgres-pgvector.yaml",
    "k8s/nim-llm-deploy.yaml",
    "k8s/nim-embed-deploy.yaml",
    "k8s/backend.yaml",
    "k8s/frontend.yaml",
    "k8s/hpa-backend.yaml",
    "k8s/ingress.yaml"
)

foreach ($file in $k8sFiles) {
    Write-Host "  Applying $file..." -ForegroundColor DarkGray
    kubectl apply -f $file
}
Write-Host "  ✅ Resources deployed" -ForegroundColor Green

# Wait for deployments
Write-Host "`n⏳ Waiting for deployments to be ready..." -ForegroundColor Yellow
kubectl wait --for=condition=available --timeout=600s deployment/backend deployment/frontend deployment/nim-llm deployment/nim-embed

# Get ingress URL
Write-Host "`n🌐 Getting application URL..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
$ingressUrl = kubectl get ingress finance-agent-ingress -o jsonpath="{.status.loadBalancer.ingress[0].hostname}"

Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "`n📍 Application URL: http://$ingressUrl" -ForegroundColor Cyan
Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run smoke tests: .\scripts\smoke.ps1 http://$ingressUrl" -ForegroundColor White
Write-Host "  2. Check logs: kubectl logs -l app=backend --tail=50" -ForegroundColor White
Write-Host "  3. Monitor: kubectl get pods -w" -ForegroundColor White
Write-Host ""
