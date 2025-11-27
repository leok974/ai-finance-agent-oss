param(
  [string]$HostUrl = "https://app.ledger-mind.org",
  [string]$Email   = $env:AUTH_EMAIL,
  [string]$Pass    = $env:AUTH_PASSWORD
)
$ErrorActionPreference = "Stop"
function Out-AuthJson([bool]$ok,$challenged,[string]$mode,[int]$exit,[string]$note,[string]$body){
  [pscustomobject]@{ok=$ok;challenged=$challenged;mode=$mode;exit_code=$exit;note=$note;body=$body}|ConvertTo-Json
}
try{
  $me=& curl.exe --ssl-no-revoke -s -o NUL -w "%{http_code}" "$HostUrl/api/auth/me"
  if($me -eq '200'){Out-AuthJson $true $false "session" 0 "me:200" "";exit 0}
  if($me -ne '401'){Out-AuthJson $false $null "unknown" ([int]$me) "me:$me" "";exit 1}
  if($Email -and $Pass){
    $resp=& curl.exe --ssl-no-revoke --location --fail-with-body -s "$HostUrl/api/auth/login" -H "Content-Type: application/json" --data "{\"email\":\"$Email\",\"password\":\"$Pass\"}" 2>&1
    if($LASTEXITCODE -eq 0){Out-AuthJson $true $false "password" 0 "login:200" "";exit 0}
    $str=$resp|Out-String;$sn=if($str){$str.Substring(0,[Math]::Min(240,$str.Length))}else{"<empty>"}
    Out-AuthJson $false $true "challenge" $LASTEXITCODE "login:fail" $sn;exit 1
  }else{
    Out-AuthJson $false $true "challenge" 401 "me:401 (no creds)" "";exit 1
  }
}catch{
  Out-AuthJson $false $null "exception" 1 "exception:$($_.Exception.Message)" "";exit 1
}
