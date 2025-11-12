<#
.SYNOPSIS
AWS Resource Cleanup Commands - Template for Future Use

.DESCRIPTION
These commands can be used to clean up non-LedgerMind AWS resources
if any are found in future audits. All commands are commented out
by default for safety.

.NOTES
Current Audit Status: NO CLEANUP NEEDED ✅
Date: 2025-11-06
#>

# Set your AWS profile and region
$env:AWS_PROFILE = "lm-admin"
$REG = "us-east-1"

# ═══════════════════════════════════════════════════════════
# EKS CLUSTER CLEANUP
# ═══════════════════════════════════════════════════════════
# Steps: nodegroups → fargate profiles → cluster

<#
$CLUSTER = "<non-ledgermind-cluster>"

# 1) Delete nodegroups first
aws eks list-nodegroups --region $REG --cluster-name $CLUSTER --query 'nodegroups[]' --output text |
    ForEach-Object {
        Write-Host "Deleting nodegroup: $_" -ForegroundColor Yellow
        aws eks delete-nodegroup --region $REG --cluster-name $CLUSTER --nodegroup-name $_
    }

# 2) Delete fargate profiles
aws eks list-fargate-profiles --region $REG --cluster-name $CLUSTER --query 'fargateProfileNames[]' --output text |
    ForEach-Object {
        Write-Host "Deleting fargate profile: $_" -ForegroundColor Yellow
        aws eks delete-fargate-profile --region $REG --cluster-name $CLUSTER --fargate-profile-name $_
    }

# 3) Wait for nodegroups/fargate to delete (check AWS console)
Read-Host "Press Enter after nodegroups/fargate are deleted..."

# 4) Delete cluster
Write-Host "Deleting cluster: $CLUSTER" -ForegroundColor Red
aws eks delete-cluster --region $REG --name $CLUSTER
#>

# ═══════════════════════════════════════════════════════════
# ECR REPOSITORY CLEANUP
# ═══════════════════════════════════════════════════════════

<#
$REPO = "<non-ledgermind-repo>"

# Delete all images first
Write-Host "Deleting images from: $REPO" -ForegroundColor Yellow
aws ecr list-images --region $REG --repository-name $REPO --query 'imageIds' --output json |
    Out-File -FilePath ".\ecr_images.json" -Encoding UTF8

aws ecr batch-delete-image --region $REG --repository-name $REPO --image-ids file://ecr_images.json
Remove-Item ".\ecr_images.json" -Force

# Delete repository
Write-Host "Deleting repository: $REPO" -ForegroundColor Red
aws ecr delete-repository --region $REG --repository-name $REPO --force
#>

# ═══════════════════════════════════════════════════════════
# LOAD BALANCER CLEANUP
# ═══════════════════════════════════════════════════════════

<#
$LB_ARN = "<arn:aws:elasticloadbalancing:...>"

Write-Host "Deleting load balancer: $LB_ARN" -ForegroundColor Red
aws elbv2 delete-load-balancer --region $REG --load-balancer-arn $LB_ARN

# Optional: Delete target groups after LB is deleted
# aws elbv2 describe-target-groups --region $REG --query 'TargetGroups[].TargetGroupArn' --output text |
#     ForEach-Object { aws elbv2 delete-target-group --region $REG --target-group-arn $_ }
#>

# ═══════════════════════════════════════════════════════════
# NAT GATEWAY & ELASTIC IP CLEANUP
# ═══════════════════════════════════════════════════════════

<#
$NAT_ID = "<nat-xxxxxxxxx>"
$EIP_ALLOC = "<eipalloc-xxxxxxxxx>"

# Delete NAT Gateway first
Write-Host "Deleting NAT Gateway: $NAT_ID" -ForegroundColor Red
aws ec2 delete-nat-gateway --region $REG --nat-gateway-id $NAT_ID

# Wait for NAT Gateway to be deleted (takes ~5 minutes)
Write-Host "Waiting for NAT Gateway deletion..." -ForegroundColor Yellow
Start-Sleep -Seconds 300

# Release Elastic IP
Write-Host "Releasing Elastic IP: $EIP_ALLOC" -ForegroundColor Red
aws ec2 release-address --region $REG --allocation-id $EIP_ALLOC
#>

# ═══════════════════════════════════════════════════════════
# EC2 INSTANCE CLEANUP
# ═══════════════════════════════════════════════════════════

<#
$INSTANCE_ID = "<i-xxxxxxxxx>"

Write-Host "Terminating instance: $INSTANCE_ID" -ForegroundColor Red
aws ec2 terminate-instances --region $REG --instance-ids $INSTANCE_ID
#>

# ═══════════════════════════════════════════════════════════
# EBS VOLUME CLEANUP (Orphaned/Unattached)
# ═══════════════════════════════════════════════════════════

<#
$VOL_ID = "<vol-xxxxxxxxx>"

Write-Host "Deleting volume: $VOL_ID" -ForegroundColor Red
aws ec2 delete-volume --region $REG --volume-id $VOL_ID
#>

# ═══════════════════════════════════════════════════════════
# NETWORK INTERFACE CLEANUP (Orphaned)
# ═══════════════════════════════════════════════════════════

<#
$ENI_ID = "<eni-xxxxxxxxx>"

Write-Host "Deleting network interface: $ENI_ID" -ForegroundColor Red
aws ec2 delete-network-interface --region $REG --network-interface-id $ENI_ID
#>

# ═══════════════════════════════════════════════════════════
# CLOUDWATCH LOG GROUP CLEANUP
# ═══════════════════════════════════════════════════════════

<#
$LOG_GROUP = "/aws/eks/<non-ledger>/cluster"

Write-Host "Deleting log group: $LOG_GROUP" -ForegroundColor Red
aws logs delete-log-group --region $REG --log-group-name $LOG_GROUP
#>

# ═══════════════════════════════════════════════════════════
# S3 BUCKET CLEANUP (Empty then Delete)
# ═══════════════════════════════════════════════════════════

<#
$BUCKET = "<non-ledgermind-bucket>"

# Empty bucket first
Write-Host "Emptying bucket: $BUCKET" -ForegroundColor Yellow
aws s3 rm s3://$BUCKET --recursive

# Delete bucket
Write-Host "Deleting bucket: $BUCKET" -ForegroundColor Red
aws s3api delete-bucket --bucket $BUCKET --region $REG
#>

Write-Host "`n✅ Cleanup template loaded. Uncomment commands as needed." -ForegroundColor Green
