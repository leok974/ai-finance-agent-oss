import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickChips, QuickChipItem } from '../QuickChips';

describe('QuickChips', () => {
	it('returns null (renders nothing) when items empty', () => {
		const { container } = render(<QuickChips items={[]} />);
		// container.firstChild should be null when component returns null
		expect(container.firstChild).toBeNull();
	});

	it('renders provided chip labels', () => {
		const items: QuickChipItem[] = [
			{ label: 'Top Merchants', action: { type: 'nl_search', query: 'top merchants' } },
			{ label: 'Expand Insights', action: { type: 'toggle', key: 'insightsExpanded' } },
		];
		render(<QuickChips items={items} />);
		expect(screen.getByText('Top Merchants')).toBeInTheDocument();
		expect(screen.getByText('Expand Insights')).toBeInTheDocument();
	});

	it('dispatches chip-action CustomEvent with action detail on click', () => {
		const items: QuickChipItem[] = [
			{ label: 'Show KPIs', action: { type: 'nl_search', query: 'show kpis' } },
		];
		const handler = vi.fn();
		window.addEventListener('chip-action', handler as EventListener);
		render(<QuickChips items={items} />);
		fireEvent.click(screen.getByText('Show KPIs'));
		expect(handler).toHaveBeenCalledTimes(1);
		const ev = handler.mock.calls[0][0] as CustomEvent;
		expect(ev.detail).toEqual({ type: 'nl_search', query: 'show kpis' });
	});

	it('dispatches chip-action with presetText for filter-based actions', () => {
		const items: QuickChipItem[] = [
			{
				label: 'View last 90 days',
				action: {
					type: 'nl_search_filters',
					filters: { start: '2024-01-01', end: '2024-03-31' },
					presetText: 'View last 90 days'
				}
			},
		];
		const handler = vi.fn();
		window.addEventListener('chip-action', handler as EventListener);
		render(<QuickChips items={items} />);
		fireEvent.click(screen.getByText('View last 90 days'));
		expect(handler).toHaveBeenCalledTimes(1);
		const ev = handler.mock.calls[0][0] as CustomEvent;
		expect(ev.detail).toMatchObject({
			type: 'nl_search_filters',
			presetText: 'View last 90 days',
			filters: { start: '2024-01-01', end: '2024-03-31' }
		});
	});
});
