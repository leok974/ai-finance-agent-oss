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

if ($global:Failed) {
  Write-Colored 'Smoke test FAILED' Red
  exit 1
} else {
  Write-Colored 'All smoke checks passed' Green
}
