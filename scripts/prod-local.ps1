<#!
.SYNOPSIS
  Spin up production-like local stack (nginx + backend + etc.) mirroring docs/PROD_LOCAL_RUNBOOK.md

.PARAMETER Fast
  Skip image rebuild (default: rebuild nginx image)

.PARAMETER NginxOnly
  Start only the nginx service (can later run without this to start rest)

.EXAMPLE
  pwsh scripts/prod-local.ps1

.EXAMPLE
  pwsh scripts/prod-local.ps1 -Fast -NginxOnly

#>
param(
  [switch]$Fast,
  [switch]$NginxOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host '[prod-local] Step 1: CSP hash render'
try { pnpm run csp:hash } catch { Write-Warning 'root csp:hash script failed (continuing)'}

$files = @('docker-compose.prod.yml','docker-compose.prod.override.yml')
$composeArgs = @()
foreach($f in $files){ if(Test-Path $f){ $composeArgs += @('-f',$f) } }
if(-not $composeArgs){ throw 'Compose files not found' }

if(-not $Fast){
  Write-Host '[prod-local] Step 2: build nginx image'
  docker compose @composeArgs build nginx
} else {
  Write-Host '[prod-local] FAST=1 -> skipping build'
}

Write-Host ('[prod-local] Step 3: starting {0}' -f ($NginxOnly ? 'nginx only' : 'full stack'))
if($NginxOnly){
  docker compose @composeArgs up -d nginx
} else {
  docker compose @composeArgs up -d
}

Write-Host '[prod-local] Step 4: health probes'
$probes = '_up','ready','metrics','api/healthz'
foreach($p in $probes){
  try { curl -s -o $null -w "$p %{http_code}`n" http://127.0.0.1:8080/$p } catch { Write-Warning "probe failed $p" }
}

Write-Host '[prod-local] Step 5: headers'
try { curl -sI http://127.0.0.1:8080/ | findstr /i 'content-security-policy' } catch {}
try { curl -sI http://127.0.0.1:8080/ | findstr /i 'referrer-policy' } catch {}
try { curl -sI http://127.0.0.1:8080/ | findstr /i 'permissions-policy' } catch {}

Write-Host '[prod-local] Step 6: metrics alias (expect 307 -> /metrics)'
try { curl -sI http://127.0.0.1:8080/api/metrics | findstr /i 'HTTP/1.1 307' } catch { Write-Warning 'metrics alias status check failed'}
try { curl -sI http://127.0.0.1:8080/api/metrics | findstr /i 'location:' } catch { Write-Warning 'metrics alias location check failed'}

Write-Host '[prod-local] Complete. Use scripts/prod-local-down.ps1 to tear down.'
