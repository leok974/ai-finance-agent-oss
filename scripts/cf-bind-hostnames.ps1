param(
  [Parameter(Mandatory=$true)][string[]]$Hostnames,
  [Parameter(Mandatory=$true)][string]$TunnelUUID,
  [Parameter(Mandatory=$true)][string]$ZoneId,
  [Parameter(Mandatory=$true)][string]$ApiToken
)
$ErrorActionPreference='Stop'
$headers = @{ Authorization = "Bearer $ApiToken"; "Content-Type" = "application/json" }
$base = "https://api.cloudflare.com/client/v4"
$target = "$TunnelUUID.cfargotunnel.com"
foreach($h in $Hostnames){
  $getUri = "$base/zones/$ZoneId/dns_records?name=$h"
  $resp = Invoke-RestMethod -Method GET -Uri $getUri -Headers $headers
  if(-not $resp.success){ throw ("API error querying {0}" -f $h) }
  $rec = $null
  if($resp.result.Count -gt 0){ $rec = $resp.result | Select-Object -First 1 }
  if($null -eq $rec){
    $payload = @{ type='CNAME'; name=$h; content=$target; proxied=$true } | ConvertTo-Json
    Invoke-RestMethod -Method POST -Uri "$base/zones/$ZoneId/dns_records" -Headers $headers -Body $payload | Out-Null
    Write-Host "Created CNAME $h -> $target (proxied)"
  } else {
    $needUpdate = ($rec.type -ne 'CNAME') -or ($rec.content -ne $target) -or (-not $rec.proxied)
    if($needUpdate){
      $payload = @{ type='CNAME'; name=$h; content=$target; proxied=$true } | ConvertTo-Json
      Invoke-RestMethod -Method PUT -Uri "$base/zones/$ZoneId/dns_records/$($rec.id)" -Headers $headers -Body $payload | Out-Null
      Write-Host "Updated $h -> $target (proxied)"
    } else {
      Write-Host "OK $h already bound"
    }
  }
}
