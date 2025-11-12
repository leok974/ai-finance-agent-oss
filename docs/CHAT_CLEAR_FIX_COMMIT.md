# Commit Message

```
fix(chat): comprehensive clear button fix with abort controller

Implements 5-part solution to ensure chat clear reliably wipes messages:

1. Store: Make clearChat() synchronous, add clearedAt timestamp
   - Wipes persistence → clears chatStore → broadcasts → bumps version
   - Cross-tab sync now handles both 'cleared' and 'CLEARED' events

2. Controls: Wire abort callback from ChatDock to cancel in-flight requests
   - Prevents ghost messages from appending after clear
   - Modal confirm calls store.clearChat() directly

3. Force re-render: Add key={sessionId:version} to message list
   - Guarantees React unmounts/remounts entire list on clear
   - Prevents stale message references

4. Abort controller: Cancel streams before clearing
   - reqRef tracks current AbortController
   - handleSend aborts previous request before starting new one
   - Cleans up controller reference on finish/error

5. Debug overlay (dev only): Shows v:X · msgs:Y · sid:ZZZZZZ
   - Helps verify store fires correctly
   - Only visible in NODE_ENV !== "production"

Fixes: Messages reappearing after clear, cross-tab sync issues, ghost
tokens from in-flight requests

Tested:
- ✅ Clear button removes messages
- ✅ localStorage keys removed
- ✅ Cross-tab sync works
- ✅ No ghost messages from aborted streams
- ✅ Debug overlay shows version increments
- ✅ Typecheck passes

Files:
- apps/web/src/state/chatSession.ts
- apps/web/src/features/chat/ChatControls.tsx
- apps/web/src/components/ChatDock.tsx
- docs/CHAT_CLEAR_FIX_IMPLEMENTATION.md (new)
```

## Alternative (Short)

```
fix(chat): clear button now reliably wipes messages + persistence

- Store: clearChat() synchronous, broadcasts to tabs, bumps version
- Controls: abort in-flight requests before clearing
- UI: force re-render with key={sessionId:version}
- Debug: dev-only overlay shows version/msgs/sid

Fixes ghost messages from aborted streams and cross-tab sync
```

## Git Commands

```bash
# Stage changes
git add apps/web/src/state/chatSession.ts
git add apps/web/src/features/chat/ChatControls.tsx
git add apps/web/src/components/ChatDock.tsx
git add docs/CHAT_CLEAR_FIX_IMPLEMENTATION.md

# Commit
git commit -m "fix(chat): comprehensive clear button fix with abort controller

Implements 5-part solution to ensure chat clear reliably wipes messages:

1. Store: Make clearChat() synchronous, add clearedAt timestamp
2. Controls: Wire abort callback to cancel in-flight requests
3. Force re-render: Add key={\`\${sessionId}:\${version}\`} to message list
4. Abort controller: Cancel streams before clearing
5. Debug overlay (dev only): Shows v:X · msgs:Y · sid:ZZZZZZ

Fixes: Messages reappearing after clear, cross-tab sync issues, ghost
tokens from in-flight requests"

# Push
git push origin ml-pipeline-2.1
```
