import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/api', async () => {
  const mod = await vi.importActual<any>('@/lib/api')
  return {
    ...mod,
    listTxns: vi.fn(async () => ({ items: [], total: 0, limit: 50, offset: 0 })),
  }
})

import TransactionsPanel from '../TransactionsPanel'

describe('TransactionsPanel (smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('renders empty state without crashing', async () => {
    render(<TransactionsPanel />)
    const empty = await screen.findByText(/No transactions\./i)
    expect(empty).toBeTruthy()
  const bulkBtn = await screen.findByRole('button', { name: /Bulk Edit/i })
  expect((bulkBtn as HTMLButtonElement).disabled).toBe(true)
  })
})
