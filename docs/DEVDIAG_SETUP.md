# DevDiag Console Capture Setup

This setup enables console capture from both the main app and the chat iframe, making logs accessible to Copilot via MCP.

## Configuration Files

### `ops/devdiag.yaml`
Main configuration file that defines:
- Console, JS errors, and network capture
- Allowed origins
- Export directory and file formats
- Target pages to test

### `.vscode/settings.json`
VS Code MCP server configuration that enables Copilot to call devdiag tools.

## Usage

### Command Line (Windows)

```powershell
# Run probe on production
.\scripts\devdiag.probe.ps1

# Custom URL
.\scripts\devdiag.probe.ps1 -Url "https://app.ledger-mind.org/?chat=debug"

# Different preset
.\scripts\devdiag.probe.ps1 -Preset "chat"
```

### Command Line (Linux/Mac)

```bash
# Make script executable (first time only)
chmod +x scripts/devdiag.probe.sh

# Run probe
./scripts/devdiag.probe.sh

# Custom URL and preset
./scripts/devdiag.probe.sh "https://app.ledger-mind.org/?chat=debug" "chat"
```

### Via Copilot Chat

Once VS Code recognizes the MCP server, ask Copilot:

```
Run mcp-devdiag probe on https://app.ledger-mind.org/?chat=diag
with preset=app and show me the last 50 console lines.
```

or

```
Fetch devdiag frontend logs and summarize errors with their stacks;
include any lines containing [chat] or [build/chat].
```

## Output

Artifacts are written to `artifacts/devdiag/`:
- `console.ndjson` - All console logs (newline-delimited JSON)
- `network.ndjson` - Network requests

## Structured Logging

Use the `__DEVLOG` helper for structured console output that's easier to parse:

```javascript
// In browser console or code
window.__DEVLOG('lmChat.snapshot', window.lmChat?.snapshot?.())
```

Output:
```
[devlog] lmChat.snapshot {
  "isOpen": true,
  "DIAG": true,
  "overlay": true,
  ...
}
```

## Chat Iframe Logs

The chat iframe logs are captured automatically because:
1. Sandbox uses `allow-same-origin` (same origin as parent)
2. DevDiag's Playwright captures console from all frames
3. Chat logs with `[build/chat]` and `[chat]` prefixes

## Checking if it Works

1. Run the probe script
2. Check for `artifacts/devdiag/console.ndjson`
3. Search for `[chat]` or `[build/chat]` entries
4. You should see build stamps and chat events

```powershell
# Quick check
Select-String -Path "artifacts/devdiag/console.ndjson" -Pattern "\[chat\]|\[build/chat\]"
```

## MCP Server Setup

The MCP server is configured in `.vscode/settings.json`:

```json
{
  "mcpServers": {
    "mcp-devdiag": {
      "command": "mcp-devdiag",
      "args": ["--stdio"],
      "env": {
        "DEVDIAG_CONFIG": "${workspaceFolder}/ops/devdiag.yaml"
      }
    }
  }
}
```

Copilot (if MCP-enabled) will automatically detect and use this server.

## Troubleshooting

### MCP Server Not Found
1. Ensure `mcp-devdiag` is installed: `pip install "mcp-devdiag[playwright,export]==0.2.1"`
2. Restart VS Code
3. Check VS Code Developer Tools console for MCP errors

### No Console Logs Captured
1. Verify `capture.console: true` in `ops/devdiag.yaml`
2. Check that the page loaded without errors
3. Look for timeout issues (increase `timeout_ms`)

### Chat Logs Missing
1. Verify iframe has `sandbox="allow-scripts allow-same-origin"`
2. Check that chat actually opened (look for `[chat] opened` in logs)
3. Ensure `?chat=diag` prevents auto-close so logs are captured
