param(
  [string]$IndexPath = "apps/web/dist/index.html"
)
if (!(Test-Path $IndexPath)) { Write-Error "Missing $IndexPath"; exit 2 }

# 1) Forbid meta CSP (must be header-only)
$meta = Select-String -Path $IndexPath -Pattern '(?is)<meta[^>]+http-equiv\s*=\s*["'']content-security-policy["'']'
if ($meta) { Write-Error "CSP <meta> found in $IndexPath"; exit 3 }

$content = Get-Content -Raw $IndexPath
$styleBlocks = [regex]::Matches($content,'(?is)<style[^>]*>(.*?)</style>').Count
$styleAttrs  = [regex]::Matches($content,'(?is)\sstyle\s*=\s*["''](.*?)["'']').Count
if ($styleBlocks -gt 0 -or $styleAttrs -gt 0) {
  Write-Error "Inline styles detected: blocks=$styleBlocks attrs=$styleAttrs"
  exit 4
}
Write-Host "[csp-guard] OK: no meta CSP, no inline styles."; exit 0
