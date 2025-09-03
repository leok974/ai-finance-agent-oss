param(
  [string]$Model = "gpt-oss:20b"
)
$ErrorActionPreference = "Stop"

Write-Host "Ensuring Ollama is running..."
$ollamaProc = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaProc) {
  Write-Host "Starting ollama serve..."
  Start-Process -FilePath "ollama" -ArgumentList "serve" -NoNewWindow
  Start-Sleep -Seconds 2
}

Write-Host "Pulling model $Model (idempotent)..."
ollama pull $Model

Write-Host "Test generating a short reply..."
$test = @"
{""model"":""$Model"",""prompt"":""hi""}
"@
Invoke-RestMethod -Uri http://localhost:11434/api/generate -Method Post -Body $test -ContentType 'application/json' | Out-Null
Write-Host "Ollama OK with $Model"
