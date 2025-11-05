import { create } from 'zustand';
import {
  chartsSummary,
  chartsMerchants,
  chartsCategories,
  chartsFlows,
  type ChartsSummary,
  type ChartsMerchants,
  type ChartsCategories,
  type ChartsFlowsData
} from '@/lib/api';

type ChartsState = {
  summary?: ChartsSummary;
  merchants: ChartsMerchants;
  categories: ChartsCategories;
  flows: ChartsFlowsData | null;
  refetchAll: (month: string) => Promise<void>;
};

export const useChartsStore = create<ChartsState>((set) => ({
  summary: undefined,
  merchants: [],
  categories: [],
  flows: null,

  async refetchAll(month: string) {
    try {
      const [s, m, c, f] = await Promise.all([
        chartsSummary(month),
        chartsMerchants(month, 10),
        chartsCategories(month, 10),
        chartsFlows(month),
      ]);
      set({ summary: s, merchants: m, categories: c, flows: f });
      console.log('[charts] refetched all data for month:', month);
    } catch (error) {
      console.error('[charts] failed to refetch:', error);
    }
  },
}));
