param([string]$Base = "https://app.ledger-mind.org")

function Hit($path, $expect) {
  $u = "$Base$path"
  $r = curl.exe --ssl-no-revoke -sS -D - -o NUL $u 2>$null
  $status = ($r -split "`r?`n")[0] -replace '.*\s(\d{3}).*','$1'
  $ok = $status -eq $expect
  "{0,-30} -> {1} (expect {2}) {3}" -f $path, $status, $expect, ($(if($ok){"OK"}else{"FAIL"}))
  if (-not $ok) { exit 1 }
}

Write-Host "== Post-shim smoke =="
Hit "/rules"              200
Hit "/charts/month-flows" 200
Hit "/api/rules"          404

# Auth endpoint (unauthenticated): expect 200 if session cookie present, usually 401 otherwise
$auth = "/api/auth/me"
$r = curl.exe --ssl-no-revoke -sS -D - -o NUL "$Base$auth" 2>$null
$status = ($r -split "`r?`n")[0] -replace '.*\s(\d{3}).*','$1'
"{0,-30} -> {1} (expected 200 if authed, 401 if not)" -f $auth, $status

Write-Host "Done."
