param(
  [string]$Base = "https://app.ledger-mind.org",
  [switch]$Insecure
)

$curl = "curl"
$k = $Insecure.IsPresent ? "-k" : ""

$probe = "?probe=1"
$paths = @(
  "/api/charts/month-summary$probe",
  "/api/charts/month-merchants$probe",
  "/api/charts/month-flows$probe",
  "/api/charts/spending-trends?months=6&probe=1",
  "/api/rules$probe",
  "/api/rules?limit=20&offset=0&probe=1",
  "/api/rules/suggestions$probe",
  "/api/rules/config$probe",
  "/api/rules/persistent$probe",
  "/api/suggestions?window_days=60&min_count=3&max_results=25&probe=1",
  "/api/config$probe",
  "/api/models$probe"
)

# Subset to assert deprecation headers explicitly
$headerCheck = @(
  "/api/charts/month-summary$probe",
  "/api/rules$probe",
  "/api/suggestions?window_days=60&min_count=3&max_results=25&probe=1"
)

$fail = $false
foreach ($p in $paths) {
  $url = "$Base$p"
  if ($headerCheck -contains $p) {
    $out = & $curl $k -s -D - -o NUL $url
    $code = if ($out -match "HTTP/.* 200") { "200" } else { "ERR" }
    $hasDep = $out -match "Deprecation:\s*true"
    $label = if ($code -eq "200" -and $hasDep) { "200 + Deprecation" } elseif ($code -eq "200") { "200 (no deprecation)" } else { "FAILED" }
    "{0,-55} {1}" -f $p, $label
    if (-not ($code -eq "200")) { $fail = $true }
  } else {
    $code = & $curl $k -s -o NUL -w "%{http_code}" $url
    "{0,-55} {1}" -f $p, $code
    if ($code -ne "200") { $fail = $true }
  }
}
if ($fail) { exit 1 } else { exit 0 }
