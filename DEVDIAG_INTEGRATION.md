# DevDiag Console Capture Integration

## Summary
Wired console capture from both main app and chat iframe to Copilot via MCP devdiag server.

## Changes Made

### Configuration Files
- ✅ `ops/devdiag.yaml` - DevDiag configuration with console/network/error capture
- ✅ `.vscode/settings.json` - Added MCP server configuration for devdiag
- ✅ `artifacts/devdiag/.gitignore` - Ignore captured artifacts

### Scripts
- ✅ `scripts/devdiag.probe.sh` - Bash probe script (Linux/Mac)
- ✅ `scripts/devdiag.probe.ps1` - PowerShell probe script (Windows)

### Structured Logging
- ✅ `apps/web/src/main.tsx` - Added `window.__DEVLOG` helper
- ✅ `apps/web/src/chat/main.tsx` - Added `window.__DEVLOG` helper to iframe

### Documentation
- ✅ `docs/DEVDIAG_SETUP.md` - Detailed setup and troubleshooting guide
- ✅ `docs/DEVDIAG_QUICK_REF.md` - Quick reference for Copilot commands

## Features

### Console Capture
- Captures all console.* from main app and chat iframe
- Includes build stamps, chat events, errors with stacks
- Exports to `artifacts/devdiag/console.ndjson`

### Network Capture
- All HTTP requests with status, timing, headers
- Exports to `artifacts/devdiag/network.ndjson`

### Structured Logging
```javascript
window.__DEVLOG('event-name', { data: 'value' })
```
Outputs JSON-formatted logs for easy parsing.

### MCP Integration
Copilot can now:
- Run probes on production
- Fetch and analyze console logs
- Filter for specific events ([chat], errors, etc.)
- Summarize issues with stack traces

## Usage

### Command Line
```powershell
# Windows
.\scripts\devdiag.probe.ps1

# Linux/Mac
./scripts/devdiag.probe.sh
```

### Via Copilot
```
Run mcp-devdiag probe on https://app.ledger-mind.org/?chat=diag
with preset=app and show me the last 50 console lines.
```

## Build & Deploy
- Build ID: Latest (includes __DEVLOG helper)
- Status: Deployed to nginx
- Testing: All overlay cleanup tests passing (8/8)

## Next Steps
1. Restart VS Code to load MCP server
2. Test Copilot integration with devdiag commands
3. Use structured logging for debugging chat issues

## References
- DevDiag: https://github.com/modelcontextprotocol/servers
- MCP Protocol: https://modelcontextprotocol.io/
- Quick Ref: `docs/DEVDIAG_QUICK_REF.md`
