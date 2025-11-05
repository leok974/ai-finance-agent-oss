[CmdletBinding()]param(
  [string]$Domain = 'app.ledger-mind.org',
  [string]$ConfigDir = './cloudflared',
  [string]$Service = 'http://nginx:80',
  [switch]$Json,
  [switch]$DryRun,
  [switch]$Force,
  [string]$TunnelUUID
)
$ErrorActionPreference='Stop'
function Out-Info($m){ if(-not $Json){ Write-Host "[info] $m" -ForegroundColor Cyan } }
function Out-Warn($m){ if(-not $Json){ Write-Host "[warn] $m" -ForegroundColor Yellow } }
function Out-Err($m){ if(-not $Json){ Write-Host "[err]  $m" -ForegroundColor Red } }
$result = [ordered]@{ steps=@(); changed=@(); errors=@(); ok=$false }

# Ensure config directory
if(-not (Test-Path $ConfigDir)){ if($DryRun){ Out-Info "Would create $ConfigDir" } else { New-Item -ItemType Directory -Path $ConfigDir | Out-Null; $result.changed+="mkdir" } }

# Detect existing config.yml
$configPath = Join-Path $ConfigDir 'config.yml'
$cfg = $null
if(Test-Path $configPath){ $cfg = Get-Content $configPath -Raw }

# Parse minimal fields
$existingUUID = $null
if($cfg){
  foreach($line in ($cfg -split "`n")){
    if($line -match '^tunnel:\s*(.+)$'){ $existingUUID = $Matches[1].Trim() }
  }
}
$tunnelId = $TunnelUUID
if(-not $tunnelId){ $tunnelId = $existingUUID }
if(-not $tunnelId){ $tunnelId = ([guid]::NewGuid().ToString()); $result.changed+="generated_uuid" }

# Credentials file path expectation
$credFile = Join-Path $ConfigDir ($tunnelId + '.json')
if(-not (Test-Path $credFile)){
  Out-Warn "Missing credentials file: $credFile"
  if(-not $DryRun){ $result.errors+="missing_credentials" }
}

# Build desired config
$desired = @(
  "tunnel: $tunnelId",
  "credentials-file: /etc/cloudflared/$tunnelId.json",
  "",
  "originRequest:",
  "  connectTimeout: 10s",
  "  tcpKeepAlive: 30s",
  "  noHappyEyeballs: true",
  "  originServerName: ledger-mind.org",
  "  noTLSVerify: false",
  "",
  "ingress:",
  "  - hostname: $Domain",
  "    service: $Service",
  "  - hostname: ledger-mind.org",
  "    service: $Service",
  "  - hostname: www.ledger-mind.org",
  "    service: $Service",
  "  - service: http_status:404"
) -join "`n"

if($cfg -ne $desired){
  if($DryRun){ Out-Info 'Would write updated config.yml' } else { $desired | Out-File -FilePath $configPath -Encoding UTF8; $result.changed+="config_updated" }
}

# Summary & next steps
$result.steps += "validate_dir"; $result.steps += "parse_config"; $result.steps += "ensure_config"; $result.steps += "check_credentials";
$result.ok = ($result.errors.Count -eq 0)
if($Json){ $result | ConvertTo-Json -Depth 4; exit ($result.ok -and 0 -or 2) }
if($result.ok){ Out-Info "Tunnel config OK (uuid=$tunnelId)" } else { Out-Err "Issues: $($result.errors -join ', ')" }
if(-not (Test-Path $credFile)){ Write-Host "Next: run 'cloudflared tunnel create <name>' and copy $tunnelId.json into $ConfigDir" -ForegroundColor Yellow }
