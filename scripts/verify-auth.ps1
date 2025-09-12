param([string]$Base="http://127.0.0.1:8000",[string]$Email="admin@local",[string]$Password="admin123")
$ErrorActionPreference="Stop"
$ses=New-Object Microsoft.PowerShell.Commands.WebRequestSession

# login
Invoke-RestMethod -Method POST -Uri "$Base/auth/login" -WebSession $ses `
  -ContentType "application/json" -Body (@{email=$Email;password=$Password}|ConvertTo-Json) | Out-Null

# whoami
$me = Invoke-RestMethod -Method GET -Uri "$Base/auth/me" -WebSession $ses
$ms = Invoke-RestMethod -Method GET -Uri "$Base/charts/month_summary" -WebSession $ses

Write-Host ("✅ Login OK. user=" + $me.email + " roles=" + ($me.roles -join ",")) 
Write-Host ("month=" + $ms.month + " total_spend=" + $ms.total_spend)
