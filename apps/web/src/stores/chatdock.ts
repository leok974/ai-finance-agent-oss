import { create } from "zustand";

type S = {
  visible: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

export const useChatDockStore = create<S>((set: (fn: any) => void) => ({
  visible: true,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
  toggle: () => set((s: S) => ({ visible: !s.visible })),
}));
