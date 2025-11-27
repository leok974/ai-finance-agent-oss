Param(
    [string]$IndexPath = 'apps/web/dist/index.html'
)

if (-not (Test-Path $IndexPath)) { throw "Not found: $IndexPath" }

Write-Verbose "Scanning $IndexPath"
$content = Get-Content -Raw -LiteralPath $IndexPath
$enc = [System.Text.Encoding]::UTF8
$sha = [System.Security.Cryptography.SHA256]::Create()

# 1) <style>...</style> blocks
$blockPattern = '(?is)<style[^>]*>(.*?)</style>'
$blockMatches = [regex]::Matches($content, $blockPattern)
$blockHashes = foreach ($m in $blockMatches) {
    $inner = $m.Groups[1].Value
    $b64 = [Convert]::ToBase64String($sha.ComputeHash($enc.GetBytes($inner)))
    "sha256-$b64"
}

# 2) style="..." attributes
$attrPattern = '(?is)\sstyle\s*=\s*"(.*?)"'
$attrMatches = [regex]::Matches($content, $attrPattern)
$attrHashes = foreach ($m in $attrMatches) {
    $val = $m.Groups[1].Value
    $b64 = [Convert]::ToBase64String($sha.ComputeHash($enc.GetBytes($val)))
    "sha256-$b64"
}

Write-Output '== <style> block hashes =='
($blockHashes | Sort-Object -Unique | ForEach-Object { "  '$_'" })
Write-Output "== style=\"...\" attribute hashes (needs 'unsafe-hashes') =="
($attrHashes | Sort-Object -Unique | ForEach-Object { "  '$_'" })
Write-Output '== Summary =='
Write-Output ("blocks: {0}  attrs: {1}" -f $blockHashes.Count, $attrHashes.Count)
