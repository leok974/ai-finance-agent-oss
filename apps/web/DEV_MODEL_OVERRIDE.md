# Dev Model Override Feature

## Overview
Allows developers to override the LLM model per-browser-tab for testing and development purposes. The override is persisted in `sessionStorage` under the key `fa.model`, which is already read by ChatDock's "Advanced → model" picker.

## Architecture

### 1. State Management (`apps/web/src/state/dev.ts`)
- **New State**: `modelOverride: string | null`
- **New Action**: `setModelOverride(m: string | null)`
- **Persistence**: `sessionStorage.setItem('fa.model', model)`
- **Scope**: Per-tab (sessionStorage, not localStorage)

### 2. API Integration (`apps/web/src/lib/api.ts`)
- **Helper Function**: `withModel<T>(body: T): T`
  - Reads `useDev.getState().modelOverride`
  - Injects `model` field into request body if override is set
  - Returns original body if no override

- **Updated Functions**:
  - `agentDescribe()` - Tooltips and panel help
  - `agentChat()` - Chat interactions

### 3. UI Controls (`apps/web/src/features/dev/DevMenu.tsx`)
Dev menu now includes:
- **Model Checkboxes** (only 2 models shown):
  - **llama3 (Fast, 8B)** → `llama3:latest` - Quick tooltips and testing
  - **gpt-oss (20B)** → `gpt-oss:20b` - Production-quality responses

- **Checkbox Behavior**:
  - Click unchecked model → Selects that model (shows checkmark)
  - Click checked model → Deselects (clears override, uses backend default)
  - Only one model can be selected at a time
  - Checkmark indicates current selection

- **Toast Notifications**: Confirms model changes
- **No clutter**: Only shows the 2 main models (excludes nomic-embed-text, default, etc.)

### 4. Backend Configuration
- **Dev Default**: `DEFAULT_LLM_MODEL=llama3:latest` (fast, 8B model)
- **Production Default**: Can be set to `gpt-oss:20b` (heavy, 20B model)
- **Override Behavior**: Frontend override takes precedence over backend default

### 5. E2E Tests (`apps/web/tests/e2e/dev-model-toggle.spec.ts`)
Four test scenarios:
1. **Checkbox Selection**: Verifies checkmark appears on selected model, clears when clicked again
2. **Model Injection**: Confirms `model` field is added to API requests
3. **Model Filtering**: Validates only llama3 and gpt-oss are shown (no nomic-embed-text)
4. **Persistence**: Validates override survives page reload

## Usage Flow

### Developer Workflow
```
1. Open Dev menu (unlocked state required)
2. Click "llama3 (Fast, 8B)" checkbox for quick tooltips
   - Checkmark appears next to llama3
3. Or click "gpt-oss (20B)" checkbox for production-quality responses
   - Checkmark moves to gpt-oss
4. Click same checkbox again to clear override (remove checkmark)
   - Reverts to backend default model
5. Override applies to ALL LLM calls in current tab
```

### API Request Flow
```
User clicks help tooltip
  → CardHelpTooltip calls agentDescribe(key, { month, stream: false })
  → withModel() checks useDev.getState().modelOverride
  → If override exists: { month, stream: false, model: 'llama3:latest' }
  → If no override: { month, stream: false }
  → Backend receives request and uses specified model or DEFAULT_LLM_MODEL
```

## Configuration Keys

### Frontend (sessionStorage)
- **Key**: `fa.model`
- **Values**: Any model ID string or `null`
- **Scope**: Current browser tab only
- **Synced With**: ChatDock's existing "Advanced → model" picker

### Backend (Environment Variables)
- **Key**: `DEFAULT_LLM_MODEL`
- **Dev Default**: `llama3:latest` (8B, Q4_0, ~4GB RAM)
- **Prod Default**: `gpt-oss:20b` (20B, MXFP4, ~12GB RAM)

## Model Recommendations

### Development (Fast Iteration)
- **Model**: `llama3:latest`
- **Size**: 8B parameters, Q4_0 quantization
- **Use Cases**: Tooltips, quick help, rapid testing
- **Speed**: ~2-3 seconds for tooltip responses
- **Memory**: ~4GB

### Production/Demos (Quality)
- **Model**: `gpt-oss:20b`
- **Size**: 20B parameters, MXFP4 quantization
- **Use Cases**: Production responses, demos, detailed explanations
- **Speed**: ~5-8 seconds for tooltip responses
- **Memory**: ~12GB

## Sync with ChatDock
The `fa.model` sessionStorage key is already used by ChatDock's "Advanced" settings panel. This means:
- Setting model via Dev menu updates ChatDock's picker
- Setting model via ChatDock updates Dev menu override
- Both UIs stay in sync automatically
- No additional code needed for synchronization

## Testing

### Manual Testing
1. Unlock Dev tools (Account menu)
2. Open Dev menu → Click "Fast"
3. Hover over any help icon (❓) → Click Why tab
4. Observe fast response (~2-3 sec)
5. Open Dev menu → Click "20B"
6. Hover over help icon → Click Why tab
7. Observe slower but higher-quality response (~5-8 sec)

### Automated Testing
```bash
# Run E2E test
pnpm -C apps/web run test:e2e dev-model-toggle.spec.ts
```

### Verification
```javascript
// Browser console
sessionStorage.getItem('fa.model')  // Should show current override

// Network tab (DevTools)
// POST /agent/describe/cards.overview?rephrase=1
// Request body should include: { "model": "llama3:latest", ... }
```

## Files Modified

### Core Implementation
- `apps/web/src/state/dev.ts` - State management
- `apps/web/src/lib/api.ts` - API helper and integration
- `apps/web/src/features/dev/DevMenu.tsx` - UI controls

### Tests
- `apps/web/tests/e2e/dev-model-toggle.spec.ts` - E2E validation

### Configuration (Already Set)
- `secrets/backend.env` - Backend defaults
- `docker-compose.yml` - Container environment

## Benefits

1. **Fast Development**: Use lightweight models for quick iteration
2. **Quality Testing**: Switch to heavy models for production validation
3. **Tab-Scoped**: Different tabs can use different models simultaneously
4. **No Backend Changes**: Override happens at frontend API layer
5. **Synced with ChatDock**: Existing UI stays synchronized
6. **Toast Feedback**: Clear confirmation of model changes
7. **Easy Reset**: One-click "Clear" to revert to defaults

## Limitations

1. **Requires Dev Unlock**: Must unlock Dev tools first (security)
2. **Tab-Scoped Only**: Not persisted across browser sessions
3. **No Validation**: Frontend doesn't validate if model exists (backend handles this)
4. **All LLM Calls**: Override applies to ALL LLM calls, not selective

## Future Enhancements

1. **Selective Override**: Override only specific call types (tooltips vs chat)
2. **Model Validation**: Show only available/reachable models
3. **Performance Metrics**: Show response time comparison between models
4. **Favorite Models**: Save frequently used model combinations
5. **Model Profiles**: Pre-configured settings (Fast Dev, Quality Demo, Production)
