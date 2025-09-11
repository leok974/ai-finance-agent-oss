param([string]$Base="http://127.0.0.1:8000",[string]$Email="admin@local",[string]$Password="admin123")
$ses=New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method POST -Uri "$Base/auth/login" -WebSession $ses -ContentType "application/json" -Body (@{email=$Email;password=$Password}|ConvertTo-Json)|Out-Null
$r=Invoke-RestMethod -Method GET -Uri "$Base/charts/month_summary" -WebSession $ses
if($r -and $r.month){Write-Host "✅ Login OK. month=$($r.month) total_spend=$($r.total_spend)";exit 0}else{exit 1}
param(
  [string]$Base = "http://127.0.0.1:8000",
  [string]$Email = "admin@local",
  [string]$Password = "admin123"
)

$ses = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function CallJson {
  param(
    [Parameter(Mandatory=$true)][ValidateSet('GET','POST','PUT','DELETE')][string]$Method,
    [Parameter(Mandatory=$true)][string]$Url,
    [hashtable]$Body
  )
  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -WebSession $ses -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 5)
  } else {
    return Invoke-RestMethod -Method $Method -Uri $Url -WebSession $ses
  }
}

try {
  # 1) Login
  $login = CallJson POST "$Base/auth/login" @{ email=$Email; password=$Password }
  if (-not $login) { throw 'Login failed' }
  Write-Host "[verify] login OK"
  # 2) Protected charts endpoint
  $r = CallJson GET "$Base/charts/month_summary"
  if ($r -and $r.month) {
    Write-Host "✅ Login OK. month=$($r.month) total_spend=$($r.total_spend)"
    exit 0
  } else {
    Write-Error "Login succeeded but protected route looks odd."
    exit 1
  }
} catch {
  Write-Error $_
  exit 1
}
