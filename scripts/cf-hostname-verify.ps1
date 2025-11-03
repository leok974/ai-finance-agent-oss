param(
  [Parameter(Mandatory=$true)][string[]]$Hostnames,
  [Parameter(Mandatory=$true)][string]$TunnelUUID,
  [Parameter(Mandatory=$true)][string]$ZoneId,
  [Parameter(Mandatory=$true)][string]$ApiToken
)
$ErrorActionPreference='Stop'
$headers = @{ Authorization = "Bearer $ApiToken" }
$base = "https://api.cloudflare.com/client/v4"
$expected = "$TunnelUUID.cfargotunnel.com"
$result = @()
foreach($h in $Hostnames){
  $query = "$base/zones/$ZoneId/dns_records?name=$h"
  try { $resp = Invoke-RestMethod -Method GET -Uri $query -Headers $headers } catch { throw ("API error getting DNS for {0}: {1}" -f $h,$_.Exception.Message) }
  $rec = $null
  if($resp.success -and $resp.result.Count -gt 0){ $rec = $resp.result | Select-Object -First 1 }
  $ok=$false; $why=$null
  if(-not $rec){
    $why='missing'
  } elseif($rec.type -ne 'CNAME'){
    $why="wrong_type:$($rec.type)"
  } elseif($rec.content -ne $expected){
    $why="wrong_target:$($rec.content)"
  } elseif(-not $rec.proxied){
    $why='not_proxied'
  } else { $ok=$true }
  $result += [pscustomobject]@{
    hostname=$h; exists=[bool]$rec; type=$rec?.type; content=$rec?.content; proxied=$rec?.proxied; expected=$expected; ok=$ok; reason=$why }
}
$result | ConvertTo-Json -Depth 5
