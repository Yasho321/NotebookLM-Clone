import { create } from 'zustand';

const STORAGE_KEY = 'chithhi-panels';

const defaults = {
  sourceWidth: 260,
  chatWidth: 340,
  sourceCollapsed: false,
  chatCollapsed: false,
  fullscreenPanel: null, // 'source' | 'content' | 'chat' | null
};

const loadFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaults, ...parsed, fullscreenPanel: null };
    }
  } catch {
    // ignore
  }
  return defaults;
};

const saveToStorage = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sourceWidth: state.sourceWidth,
      chatWidth: state.chatWidth,
      sourceCollapsed: state.sourceCollapsed,
      chatCollapsed: state.chatCollapsed,
    }));
  } catch {
    // ignore
  }
};

export const usePanelStore = create((set, get) => ({
  ...loadFromStorage(),

  setSourceWidth: (width) => {
    const clamped = Math.max(200, Math.min(500, width));
    set({ sourceWidth: clamped });
    saveToStorage({ ...get(), sourceWidth: clamped });
  },

  setChatWidth: (width) => {
    const clamped = Math.max(260, Math.min(600, width));
    set({ chatWidth: clamped });
    saveToStorage({ ...get(), chatWidth: clamped });
  },

  toggleSourceCollapsed: () => {
    const next = !get().sourceCollapsed;
    set({ sourceCollapsed: next, fullscreenPanel: null });
    saveToStorage({ ...get(), sourceCollapsed: next });
  },

  toggleChatCollapsed: () => {
    const next = !get().chatCollapsed;
    set({ chatCollapsed: next, fullscreenPanel: null });
    saveToStorage({ ...get(), chatCollapsed: next });
  },

  toggleFullscreen: (panel) => {
    const current = get().fullscreenPanel;
    set({ fullscreenPanel: current === panel ? null : panel });
  },

  // For mobile tab switching
  activeTab: 'content',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
