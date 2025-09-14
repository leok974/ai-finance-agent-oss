import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import HelpExplainListener from '@/components/HelpExplainListener';

const explainSpy = vi.fn();
vi.mock('@/hooks/useExplain', () => ({
  useExplain: () => ({ explain: explainSpy })
}));

describe('HelpExplainListener', () => {
  it('invokes explain on help-mode:explain', async () => {
    render(<HelpExplainListener />);

    const detail = { key: 'cards.month_summary', month: '2025-08' };
    window.dispatchEvent(new CustomEvent('help-mode:explain', { detail }));

  expect(explainSpy).toHaveBeenCalledWith('cards.month_summary', { month: '2025-08', withContext: true });
  });
});
