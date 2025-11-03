import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetchJSON to observe calls and return a stub
vi.mock('@/lib/http', async (importOriginal) => {
  const mod = await importOriginal() as typeof import('@/lib/http')
  return {
    ...mod,
    fetchJSON: vi.fn(),
  }
})

import { undoRejectSuggestion } from '@/lib/api'
import { fetchJSON } from '@/lib/http'

describe('api: undoRejectSuggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs to agent/tools/categorize/feedback/undo with merchant + category', async () => {
    const merchant = 'starbucks'
    const category = 'coffee'
    ;(fetchJSON as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ ok: true, deleted: 1 })

    const res = await undoRejectSuggestion(merchant, category)
    expect(res).toEqual({ ok: true, deleted: 1 })

    expect(fetchJSON).toHaveBeenCalledTimes(1)
    const calls = (fetchJSON as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const [path, opts] = calls[0] as [string, { method?: string; body?: string }]
    expect(path).toBe('agent/tools/categorize/feedback/undo')
    expect(opts?.method).toBe('POST')
    const body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : opts?.body
    expect(body).toEqual({ merchant_canonical: merchant, category_slug: category })
  })
})
