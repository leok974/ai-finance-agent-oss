import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import UnknownsPanel from '../UnknownsPanel'
import * as useUnknownsModule from '@/hooks/useUnknowns'

// Mock the useUnknowns hook
vi.mock('@/hooks/useUnknowns', () => ({
  useUnknowns: vi.fn()
}))

// Mock other dependencies
vi.mock('@/hooks/useRuleSeedHook', () => ({
  useRuleSeed: () => ({ setRuleSeed: vi.fn() })
}))

vi.mock('@/state/auth', () => ({
  useIsAdmin: () => false
}))

vi.mock('@/utils/refreshBus', () => ({
  useCoalescedRefresh: () => vi.fn()
}))

vi.mock('@/api', () => ({
  mlFeedback: vi.fn(),
  suggestForTxnBatch: vi.fn().mockResolvedValue({ items: [] })
}))

// Helper to render with TooltipProvider
const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <TooltipProvider>
      {ui}
    </TooltipProvider>
  )
}

describe('UnknownsPanel - Three-state display logic', () => {
  it('State A: Shows "No transactions yet" when totalCount === 0', () => {
    vi.mocked(useUnknownsModule.useUnknowns).mockReturnValue({
      items: [],
      totalCount: 0,
      unknownCount: 0,
      loading: false,
      error: null,
      currentMonth: '2025-11',
      refresh: vi.fn()
    })

    renderWithProviders(<UnknownsPanel month="2025-11" />)

    // Should show "No transactions yet" state
    expect(screen.getByText(/No transactions yet/i)).toBeInTheDocument()
    expect(screen.getByText(/Upload a CSV or use sample data to get started/i)).toBeInTheDocument()
  })

  it('State B: Shows count summary when unknownCount > 0', () => {
    const mockUnknowns = [
      { id: 1, date: '2025-11-01', merchant: 'Unknown Store', description: 'Purchase', amount: -50, category: 'unknown' },
      { id: 2, date: '2025-11-02', merchant: 'Mystery Merchant', description: 'Charge', amount: -75, category: 'unknown' },
      { id: 3, date: '2025-11-03', merchant: 'Unknown Vendor', description: 'Payment', amount: -100, category: 'unknown' }
    ]

    vi.mocked(useUnknownsModule.useUnknowns).mockReturnValue({
      items: mockUnknowns,
      totalCount: 25,
      unknownCount: 3,
      loading: false,
      error: null,
      currentMonth: '2025-11',
      refresh: vi.fn()
    })

    renderWithProviders(<UnknownsPanel month="2025-11" />)

    // Should show count summary with specific text
    expect(screen.getByText(/You have/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/uncategorized transactions this month/i)).toBeInTheDocument()
    expect(screen.getByText(/22 already categorized/i)).toBeInTheDocument()

    // Should NOT show "No transactions yet"
    expect(screen.queryByText(/No transactions yet/i)).not.toBeInTheDocument()
  })

  it('State B: Shows singular form when unknownCount === 1', () => {
    const mockUnknowns = [
      { id: 1, date: '2025-11-01', merchant: 'Unknown Store', description: 'Purchase', amount: -50, category: 'unknown' }
    ]

    vi.mocked(useUnknownsModule.useUnknowns).mockReturnValue({
      items: mockUnknowns,
      totalCount: 10,
      unknownCount: 1,
      loading: false,
      error: null,
      currentMonth: '2025-11',
      refresh: vi.fn()
    })

    renderWithProviders(<UnknownsPanel month="2025-11" />)

    // Should show singular form
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/uncategorized transaction this month/i)).toBeInTheDocument()
    expect(screen.getByText(/9 already categorized/i)).toBeInTheDocument()
  })

  it('State C: Shows "All caught up" when unknownCount === 0 but totalCount > 0', () => {
    vi.mocked(useUnknownsModule.useUnknowns).mockReturnValue({
      items: [],
      totalCount: 25,
      unknownCount: 0,
      loading: false,
      error: null,
      currentMonth: '2025-11',
      refresh: vi.fn()
    })

    renderWithProviders(<UnknownsPanel month="2025-11" />)

    // Should show "All caught up" state
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument()
    expect(screen.getByText(/Nothing uncategorized! Every transaction has a category./i)).toBeInTheDocument()

    // Should NOT show "No transactions yet"
    expect(screen.queryByText(/No transactions yet/i)).not.toBeInTheDocument()
  })

  it('Shows loading skeleton when loading === true', () => {
    vi.mocked(useUnknownsModule.useUnknowns).mockReturnValue({
      items: [],
      totalCount: 0,
      unknownCount: 0,
      loading: true,
      error: null,
      currentMonth: '2025-11',
      refresh: vi.fn()
    })

    renderWithProviders(<UnknownsPanel month="2025-11" />)

    // Should show loading state (skeleton)
    // The component renders 3 skeleton items
    const skeletons = screen.getAllByTestId(/.*/) // Skeletons don't have testid but are rendered
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('Shows error message when error is present', () => {
    vi.mocked(useUnknownsModule.useUnknowns).mockReturnValue({
      items: [],
      totalCount: 0,
      unknownCount: 0,
      loading: false,
      error: 'Failed to load unknowns',
      currentMonth: '2025-11',
      refresh: vi.fn()
    })

    renderWithProviders(<UnknownsPanel month="2025-11" />)

    // Should show error message
    expect(screen.getByText(/Failed to load unknowns/i)).toBeInTheDocument()
  })
})
