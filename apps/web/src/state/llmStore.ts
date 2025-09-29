import { create } from 'zustand';
import { getLlmHealth, fetchModels } from '@/lib/api';

export type LlmState = {
  modelsOk?: boolean;
  path?: 'primary' | 'fallback-openai' | string;
  lastRefreshed?: number;
  refreshing: boolean;
  error?: string;
  refresh: (opts?: { refreshModels?: boolean }) => Promise<void>;
};

export const useLlmStore = create<LlmState>()((set) => ({
  modelsOk: undefined,
  path: undefined,
  lastRefreshed: undefined,
  refreshing: false,
  error: undefined,
  refresh: async ({ refreshModels = true } = {}) => {
    set({ refreshing: true, error: undefined });
    try {
      const health = await getLlmHealth();
      const models = await fetchModels(refreshModels);
      const primaryOk = !!(models?.primary?.reachable && (models as any)?.primary?.model);
      const fallbackOk = !!(models?.fallback?.reachable && (models as any)?.fallback?.model);
      const path = (health as any)?.path ?? (primaryOk ? 'primary' : (fallbackOk ? 'fallback-openai' : undefined));
      set({
        modelsOk: primaryOk || fallbackOk,
        path,
        lastRefreshed: Date.now(),
        refreshing: false,
        error: undefined,
      });
    } catch (e: any) {
      set({ refreshing: false, error: e?.message || 'Failed to refresh LLM status' });
    }
  }
}));
