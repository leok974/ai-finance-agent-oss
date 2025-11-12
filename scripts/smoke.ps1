#!/usr/bin/env pwsh
param(
  [string]$BaseUrl = 'https://app.ledger-mind.org'
)

$ErrorActionPreference = 'Stop'

function Write-Colored($Text, $Color) {
  Write-Host $Text -ForegroundColor $Color
}

$global:Failed = $false

function Invoke-Check {
  param(
    [string]$Path,
    [int]$Expect = 200
  )
  $url = "$BaseUrl$Path"
  Write-Colored "[info] GET $url" Cyan
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $url -Method GET -TimeoutSec 20
    $code = $resp.StatusCode
    if ($code -ne $Expect) {
      Write-Colored "[FAIL] $Path expected $Expect got $code" Red
      $global:Failed = $true
    } else {
      Write-Colored "[OK] $Path ($code)" Green
    }
    if ($Path -eq '/ready') {
      $body = $resp.Content
      if ($body -and ($body -notmatch '"mode"\s*:\s*"kms"')) {
        Write-Colored "[WARN] /ready does not indicate mode=kms" Yellow
        $global:Failed = $true
      }
    }
  }
  catch {
    Write-Colored "[ERROR] $Path $_" Red
    $global:Failed = $true
  }
}

Invoke-Check -Path '/ready'
Invoke-Check -Path '/api/healthz'
Invoke-Check -Path '/api/openapi.json'

# Agent chat smoke check - verify reply/text in response
Write-Colored "[info] POST /api/agent/chat (smoke check)" Cyan
try {
  $body = @{
    messages = @(@{ role = "user"; content = "ping" })
    context = @{ month = "2025-08" }
  } | ConvertTo-Json -Depth 3

  $resp = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/agent/chat" `
    -ContentType "application/json" -Body $body -TimeoutSec 20 -ErrorAction Stop

  $hasReply = $resp.reply -or $resp.text -or $resp.result.text
  if (-not $hasReply) {
    Write-Colored "[FAIL] /api/agent/chat: missing reply/text in response" Red
    $global:Failed = $true
  } else {
    Write-Colored "[OK] /api/agent/chat ✅" Green
  }
}
catch {
  Write-Colored "[ERROR] /api/agent/chat $_" Red
  $global:Failed = $true
}

if ($global:Failed) {
  Write-Colored 'Smoke test FAILED' Red
  exit 1
} else {
  Write-Colored 'All smoke checks passed' Green
}
