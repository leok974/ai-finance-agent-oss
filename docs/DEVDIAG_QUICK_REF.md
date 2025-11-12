# DevDiag + Copilot Quick Reference

## 🎯 Quick Commands

### Run Probe (PowerShell)
```powershell
.\scripts\devdiag.probe.ps1
```

### Check Captured Logs
```powershell
Select-String -Path "artifacts/devdiag/console.ndjson" -Pattern "\[chat\]|\[build/chat\]" | Select-Object -Last 20
```

### View All Artifacts
```powershell
Get-ChildItem "artifacts/devdiag" | Format-Table Name, Length, LastWriteTime
```

## 💬 Ask Copilot (MCP-enabled builds)

### Probe and Analyze
```
Run mcp-devdiag probe on https://app.ledger-mind.org/?chat=diag
with preset=app and show me the last 50 console lines.
```

### Find Specific Issues
```
Fetch devdiag frontend logs and summarize errors with their stacks;
include any lines containing [chat] or [build/chat].
```

### Analyze Chat Behavior
```
Get devdiag console logs, filter for [chat] or lmChat,
and show the chat open/close sequence with timestamps.
```

### Network Analysis
```
Read artifacts/devdiag/network.ndjson and show all failed requests
with status codes and URLs.
```

## 🔧 Structured Logging in Browser Console

### Capture Chat State
```javascript
window.__DEVLOG('chat-state', window.lmChat?.snapshot?.())
```

### Log Custom Data
```javascript
window.__DEVLOG('custom-event', {
  action: 'button-click',
  timestamp: Date.now(),
  data: someObject
})
```

## 📊 What Gets Captured

- ✅ All console.log/warn/error from main app
- ✅ All console.log/warn/error from chat iframe
- ✅ JavaScript errors with stack traces
- ✅ Network requests (URL, method, status, timing)
- ✅ Build stamps from both bundles
- ✅ Chat lifecycle events (open, close, errors)

## 🐛 Debugging Common Issues

### Chat Not Opening
```
Copilot: "Check devdiag logs for [chat] entries.
Show me any errors or the last chat-related log before failure."
```

### Overlay Stuck
```
Copilot: "Find lmChat.snapshot in devdiag logs.
Show overlay state and isOpen flag."
```

### Build Version Mismatch
```
Copilot: "Extract [build] and [build/chat] lines from console logs.
Compare commit hashes between main and chat bundles."
```

## 📁 Output Files

| File | Content |
|------|---------|
| `console.ndjson` | All console logs (newline-delimited JSON) |
| `network.ndjson` | HTTP requests and responses |

## 🔍 Manual Analysis

### View Console Logs
```powershell
Get-Content "artifacts/devdiag/console.ndjson" | ConvertFrom-Json |
  Where-Object { $_.text -match '\[chat\]' } |
  Select-Object timestamp, level, text
```

### Count Errors
```powershell
Get-Content "artifacts/devdiag/console.ndjson" | ConvertFrom-Json |
  Where-Object { $_.level -eq 'error' } |
  Measure-Object | Select-Object Count
```

### Find Network Failures
```powershell
Get-Content "artifacts/devdiag/network.ndjson" | ConvertFrom-Json |
  Where-Object { $_.status -ge 400 } |
  Select-Object method, url, status
```

## ⚙️ Configuration

### Enable/Disable Captures
Edit `ops/devdiag.yaml`:
```yaml
capture:
  console: true      # Console logs
  js_errors: true    # Uncaught exceptions
  network: true      # HTTP requests
  screenshots: false # Screenshots (disabled for performance)
```

### Change Target URL
```yaml
pages:
  - url: "https://app.ledger-mind.org/?chat=diag"
    wait_until: "networkidle"
    timeout_ms: 20000
```

### Add More Presets
```yaml
diag:
  presets: ["app", "chat"]  # Multiple presets
```

## 🚀 CI/CD Integration

Add to GitHub Actions:
```yaml
- name: Run DevDiag Probe
  run: |
    pip install "mcp-devdiag[playwright,export]==0.2.1"
    mcp-devdiag probe --url https://app.ledger-mind.org/?chat=diag --preset app --format json --export

- name: Upload Artifacts
  uses: actions/upload-artifact@v3
  with:
    name: devdiag-logs
    path: artifacts/devdiag/
```

## 📖 More Info

See `docs/DEVDIAG_SETUP.md` for detailed setup instructions.
