import { create } from 'zustand';
import { http } from '@/lib/http';

type DevState = {
  isUnlocked: boolean;
  setUnlocked: (v: boolean) => void;
  openPlannerPanel: () => void;
  seedDemoData: () => Promise<void>;
  clearDb: () => Promise<void>;
  refreshModels: () => Promise<void>;
  modelOverride: string | null;
  setModelOverride: (m: string | null) => void;
};

const KEY = 'fa.dev.unlocked.v1';
const MODEL_KEY = 'fa.model'; // ChatDock already reads this per README

export const useDev = create<DevState>((set) => ({
  isUnlocked: sessionStorage.getItem(KEY) === '1',
  setUnlocked: (v) => {
    if (v) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
    set({ isUnlocked: v });
  },

  modelOverride: sessionStorage.getItem(MODEL_KEY) || null,
  setModelOverride: (m) => {
    if (m) sessionStorage.setItem(MODEL_KEY, m);
    else sessionStorage.removeItem(MODEL_KEY);
    set({ modelOverride: m });
  },

  openPlannerPanel() {
    // Wire to your current planner dev panel opener
    // Dispatch event that can be caught by the main app
    document.dispatchEvent(new CustomEvent('dev:planner:open'));
  },

  async seedDemoData() {
    await http('/api/dev/seed', { method: 'POST' });
  },

  async clearDb() {
    await http('/api/dev/clear', { method: 'POST' });
  },

  async refreshModels() {
    await http('/api/agent/models?refresh=1');
  },
}));
