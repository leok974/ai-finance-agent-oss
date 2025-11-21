import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { SearchTransactionsInlineTable } from '@/components/ChatDock/ToolResults/SearchTransactionsInlineTable';

describe('SearchTransactionsInlineTable', () => {
  it('renders rows for items', () => {
    render(
      <SearchTransactionsInlineTable
        items={[
          {
            id: 1,
            booked_at: '2025-11-10',
            merchant_canonical: 'Starbucks',
            amount: -6.5,
            category_slug: 'restaurant',
          },
        ]}
      />,
    );

    const table = screen.getByTestId('lm-chat-tool-search-results');
    expect(table).toBeInTheDocument();
    expect(
      screen.getByText('Starbucks', { exact: false }),
    ).toBeInTheDocument();
  });

  it('renders nothing when items is empty', () => {
    const { container } = render(
      <SearchTransactionsInlineTable items={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays amount as positive value', () => {
    render(
      <SearchTransactionsInlineTable
        items={[
          {
            id: 2,
            booked_at: '2025-11-15',
            merchant_canonical: 'Amazon',
            amount: -42.99,
            category_slug: 'shopping',
          },
        ]}
      />,
    );

    // Amount should be displayed as positive
    expect(screen.getByText('$42.99')).toBeInTheDocument();
  });

  it('shows category or dash for uncategorized', () => {
    const { rerender } = render(
      <SearchTransactionsInlineTable
        items={[
          {
            id: 3,
            booked_at: '2025-11-16',
            merchant_canonical: 'Target',
            amount: -25.00,
            category_slug: 'groceries',
          },
        ]}
      />,
    );

    expect(screen.getByText('groceries')).toBeInTheDocument();

    rerender(
      <SearchTransactionsInlineTable
        items={[
          {
            id: 4,
            booked_at: '2025-11-17',
            merchant_canonical: 'Shell',
            amount: -50.00,
            category_slug: null,
          },
        ]}
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows footer note when 5 or more items', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      booked_at: `2025-11-${10 + i}`,
      merchant_canonical: `Merchant ${i + 1}`,
      amount: -(i + 1) * 10,
      category_slug: 'test',
    }));

    render(<SearchTransactionsInlineTable items={items} />);

    expect(screen.getByText(/Showing top 5 results/i)).toBeInTheDocument();
  });
});
