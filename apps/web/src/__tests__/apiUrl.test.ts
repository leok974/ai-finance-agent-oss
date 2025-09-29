import { describe, it, expect } from 'vitest'
import { API_BASE, apiUrl } from '@/lib/api'

// NOTE: vitest config defines VITE_API_BASE as '' so API_BASE should fallback to '/api'

describe('apiUrl helper', () => {
  it('normalizes base to /api when env empty', () => {
    expect(API_BASE).toBe('/api')
  })
  it('joins with leading slash in path', () => {
    expect(apiUrl('/healthz')).toBe('/api/healthz')
  })
  it('adds slash if missing', () => {
    expect(apiUrl('healthz')).toBe('/api/healthz')
  })
  it('handles double slashes gracefully', () => {
    expect(apiUrl('//rules')).toBe('/api//rules') // we intentionally preserve internal // to avoid accidental path rewrite
  })
})
