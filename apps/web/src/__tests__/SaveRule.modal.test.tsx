import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/aguiStream', () => {
  return {
    wireAguiStream: (opts: any) => ({
      start: () => {
        queueMicrotask(() => {
          opts.onEvent?.({ type: 'RUN_STARTED', payload: { intent: 'what-if' } });
          opts.onEvent?.({ type: 'SUGGESTIONS', payload: { items: ['Save as rule'] } });
          opts.onEvent?.({ type: 'RUN_FINISHED', payload: { ok: true } });
        });
      },
      stop: () => {}
    })
  }
})

vi.mock('@/lib/api', async (orig) => {
  const base: any = await orig();
  return Object.assign({}, base, {
    saveRule: vi.fn(async () => ({ display_name: 'Auto: test' }))
  });
})

import Providers from '@/components/Providers'
import ChatDock from '@/components/ChatDock'

// Minimal test just asserts suggestion appears (legacy modal currently)

describe.skip('Save Rule modal integration', () => {
  it('shows suggestion chip', async () => {
    render(<Providers><ChatDock /></Providers>)
    const user = userEvent.setup()
    // heuristic: open panel via keyboard shortcut (fallback click bubble if present)
    // For simplicity assume bubble present
  const bubble = await screen.findByRole('button', { name: /agent chat/i }).catch(()=>null)
    if (bubble) await user.click(bubble)
    // Wait for chip
    const chip = await screen.findByRole('button', { name: /save as rule/i })
    expect(chip).toBeInTheDocument()
  })
})
