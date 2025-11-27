param(
  [string]$ReportPath = "apps/web/playwright-report/results.json",
  [int]$DefaultBudgetMs = 1500,
  [switch]$AsJson
)

if (-not (Test-Path -LiteralPath $ReportPath)) {
  Write-Error "Playwright JSON report not found at '$ReportPath'. Run pnpm -C apps/web test:pw --reporter json first." -ErrorAction Stop
}

try {
  $json = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json -Depth 32
} catch {
  Write-Error "Failed to parse Playwright report JSON: $($_.Exception.Message)" -ErrorAction Stop
}

function Get-PwTests {
  param($suite)
  if ($null -ne $suite.tests) {
    foreach ($t in $suite.tests) {
      $t
    }
  }
  if ($null -ne $suite.suites) {
    foreach ($child in $suite.suites) {
      foreach ($inner in (Get-PwTests -suite $child)) {
        $inner
      }
    }
  }
}

$budgetMs = $DefaultBudgetMs
if ($env:AGENT_FIRST_CHUNK_BUDGET_MS) {
  try { $budgetMs = [int]$env:AGENT_FIRST_CHUNK_BUDGET_MS } catch { }
}

$reportDir = Split-Path -Path $ReportPath -Parent
$tests = @()

foreach ($suite in $json.suites) {
  foreach ($test in (Get-PwTests -suite $suite)) {
    foreach ($result in $test.results) {
      $attachment = $null
      if ($result.attachments) {
        $attachment = $result.attachments | Where-Object { $_.name -eq 'first-chunk.json' } | Select-Object -First 1
      }
      if (-not $attachment) {
        continue
      }

      $attachmentPath = $attachment.path
      if (-not [string]::IsNullOrEmpty($attachmentPath) -and -not (Test-Path -LiteralPath $attachmentPath)) {
        $candidate = Join-Path -Path $reportDir -ChildPath $attachmentPath
        if (Test-Path -LiteralPath $candidate) {
          $attachmentPath = $candidate
        }
      }

      if (-not [string]::IsNullOrEmpty($attachmentPath)) {
        try {
          $measurement = Get-Content -LiteralPath $attachmentPath -Raw | ConvertFrom-Json -Depth 8
        } catch {
          $measurement = $null
        }
      } elseif ($attachment.body) {
        try {
          $measurement = $attachment.body | ConvertFrom-Json -Depth 8
        } catch {
          $measurement = $null
        }
      } else {
        $measurement = $null
      }

      $titleParts = @()
      if ($test.projectName) { $titleParts += $test.projectName }
      if ($test.titlePath) {
        $titleParts += ($test.titlePath | Where-Object { $_ })
      } elseif ($test.title) {
        $titleParts += $test.title
      }
      $title = if ($titleParts.Count) { $titleParts -join ' › ' } else { $test.title }

      $firstChunkMs = $null
      $ok = $null
      $eventType = $null
      $fallback = $null
  $errMessage = $null
      if ($measurement) {
        $firstChunkMs = $measurement.firstChunkMs
        $ok = $measurement.ok
        $eventType = $measurement.eventType
        $fallback = $measurement.fallback
  $errMessage = $measurement.error
      }

      $tests += [pscustomobject]@{
        Test = $title
        Status = $result.status
        Ok = $ok
        FirstChunkMs = $firstChunkMs
        BudgetMs = $budgetMs
  DeltaMs = if ($null -ne $firstChunkMs) { [int]$firstChunkMs - $budgetMs } else { $null }
        EventType = $eventType
        Fallback = $fallback
  Error = $errMessage
      }
    }
  }
}

if (-not $tests.Count) {
  Write-Warning "No first-chunk measurements found in Playwright report. Ensure the stream test ran and attachments were collected."
  return
}

$valid = $tests | Where-Object { $_.FirstChunkMs -ne $null }
$avg = if ($valid.Count) { [math]::Round(($valid | Measure-Object -Property FirstChunkMs -Average).Average, 2) } else { $null }
$max = if ($valid.Count) { ($valid | Measure-Object -Property FirstChunkMs -Maximum).Maximum } else { $null }
$min = if ($valid.Count) { ($valid | Measure-Object -Property FirstChunkMs -Minimum).Minimum } else { $null }
$withinBudget = if ($valid.Count) { ($valid | Where-Object { $_.FirstChunkMs -le $_.BudgetMs }).Count } else { 0 }

$resultObject = [pscustomobject]@{
  BudgetMs = $budgetMs
  Total = $tests.Count
  WithMeasurements = $valid.Count
  WithinBudget = $withinBudget
  AvgFirstChunkMs = $avg
  MaxFirstChunkMs = $max
  MinFirstChunkMs = $min
  Tests = $tests
}

if ($AsJson) {
  $resultObject | ConvertTo-Json -Depth 6
  return
}

Write-Host "First chunk latency summary" -ForegroundColor Cyan
Write-Host "Budget: $budgetMs ms" -ForegroundColor Gray
if ($null -ne $avg) {
  Write-Host "Avg: $avg ms   Min: $min ms   Max: $max ms   Within budget: $withinBudget / $($valid.Count)" -ForegroundColor Gray
}

$tests | Sort-Object -Property FirstChunkMs | Format-Table -AutoSize
