param(
  [string]$HostUrl = "https://app.ledger-mind.org",
  [string]$MetricsFile = "ops/metrics/edge.prom",
  [switch]$IncludeGenerate,
  [switch]$AuthTest,
  [switch]$Json
)

$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36 edge-probe'

$ErrorActionPreference = "Stop"

# Import original edge-verify functions
. "$PSScriptRoot\edge-verify.ps1" -HostUrl $HostUrl -MetricsFile $MetricsFile -AuthTest:$AuthTest -Json:$false

# Enhanced LLM testing with provider-aware latency tracking
function Test-LLMWithProvider([string]$Url, [int]$TimeoutSec=15) {
  $result = @{
    code = $null
    latency_ms = $null
    provider = $null
    model = $null
    ok = $false
    error = $null
    sample = $null
  }

  try {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = & curl.exe --ssl-no-revoke --http1.1 -H "User-Agent: $UA" -sSL --max-time $TimeoutSec $Url 2>$null
    $stopwatch.Stop()

    $result.latency_ms = [int]$stopwatch.ElapsedMilliseconds

    # Try to parse JSON response
    try {
      $json = $response | ConvertFrom-Json
      $result.code = "200"  # If we got valid JSON, assume 200
      $result.ok = [bool]$json.ok
      $result.provider = $json.provider -or "unknown"
      $result.model = $json.model -or "unknown"
      $result.sample = $json.sample -or ""
      if ($json.error) {
        $result.error = $json.error
      }
    } catch {
      $result.code = "error"
      $result.error = "json_parse_failed"
      $result.provider = "error"
    }
  } catch {
    $result.code = "error"
    $result.error = $_.Exception.Message
    $result.provider = "error"
    if ($stopwatch) {
      $result.latency_ms = [int]$stopwatch.ElapsedMilliseconds
    }
  }

  return $result
}

function Test-AguiStreamFirstChunk([string]$Url, [string]$Query="ping", [int]$TimeoutSec=30) {
  $result = @{
    first_chunk_latency_ms = $null
    total_latency_ms = $null
    provider = $null
    ok = $false
    error = $null
    chunk_count = 0
  }

  try {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $firstChunkTime = $null
    $chunks = @()
    $provider = $null

    # Use EventSource-like behavior to track first chunk
    $url = "$Url/agui/chat?q=$([Uri]::EscapeDataString($Query))"

    $process = Start-Process -FilePath "curl.exe" -ArgumentList @(
      "--ssl-no-revoke",
      "--http1.1",
      "-H", "User-Agent: $UA",
      "-H", "Accept: text/event-stream",
      "-H", "Cache-Control: no-cache",
      "-sSL",
      "--max-time", $TimeoutSec,
      $url
    ) -PassThru -RedirectStandardOutput -NoNewWindow

    $reader = $process.StandardOutput
    $firstChunk = $true

    while ((-not $process.HasExited) -and ($stopwatch.ElapsedMilliseconds -lt ($TimeoutSec * 1000))) {
      $line = $reader.ReadLine()
      if ($line) {
        if ($firstChunk -and $line.StartsWith("data:")) {
          $firstChunkTime = $stopwatch.ElapsedMilliseconds
          $firstChunk = $false
        }

        if ($line.StartsWith("data:")) {
          $chunks += $line
          try {
            $data = ($line -replace "^data:\s*", "") | ConvertFrom-Json
            if ($data.type -eq "META" -and $data.data.fallback) {
              $provider = "fallback-" + $data.data.fallback
            }
          } catch {
            # Ignore JSON parse errors for individual chunks
          }
        }
      }
      Start-Sleep -Milliseconds 50
    }

    $stopwatch.Stop()
    try { $process.Kill() } catch { }

    $result.total_latency_ms = [int]$stopwatch.ElapsedMilliseconds
    $result.first_chunk_latency_ms = if ($firstChunkTime) { [int]$firstChunkTime } else { $null }
    $result.provider = $provider -or "primary"
    $result.chunk_count = $chunks.Count
    $result.ok = ($chunks.Count -gt 0)

    if (-not $result.ok) {
      $result.error = "no_chunks_received"
    }

  } catch {
    $result.error = $_.Exception.Message
    if ($stopwatch) {
      $result.total_latency_ms = [int]$stopwatch.ElapsedMilliseconds
    }
  }

  return $result
}

# Enhanced endpoint testing with provider tracking
$llm_echo = Test-LLMWithProvider "$HostUrl/llm/echo"
$agui_stream = if ($IncludeGenerate) { Test-AguiStreamFirstChunk $HostUrl "ping" } else { @{} }

# Combine with original results and add LLM metrics
$enhanced = $out.PSObject.Copy()
$enhanced.llm = @{
  echo = $llm_echo
  stream = $agui_stream
}

# Enhanced metrics output with provider labels
$llmEchoOK = [int]([bool]$llm_echo.ok)
$llmProvider = $llm_echo.provider -or "unknown"
$streamFirstChunkOK = if ($IncludeGenerate) { [int]([bool]($null -ne $agui_stream.first_chunk_latency_ms)) } else { 0 }
$streamProvider = if ($IncludeGenerate) { $agui_stream.provider -or "unknown" } else { "unknown" }

$metricsContent = Get-Content $MetricsFile -Raw
$enhancedMetrics = $metricsContent + @"

# LLM endpoint metrics with provider labels
edge_llm_echo_ok{provider="$llmProvider"} $llmEchoOK
edge_llm_echo_latency_ms{provider="$llmProvider"} $($llm_echo.latency_ms -or 0)
edge_stream_first_chunk_ok{provider="$streamProvider"} $streamFirstChunkOK
edge_stream_first_chunk_latency_ms{provider="$streamProvider"} $($agui_stream.first_chunk_latency_ms -or 0)
edge_stream_total_latency_ms{provider="$streamProvider"} $($agui_stream.total_latency_ms -or 0)
"@

$enhancedMetrics | Out-File -Encoding ascii -FilePath $MetricsFile

if ($Json) { $enhanced | ConvertTo-Json -Depth 6 } else { $enhanced }
if (-not $enhanced.summary.ok -or (-not $llm_echo.ok)) { exit 1 } else { exit 0 }
