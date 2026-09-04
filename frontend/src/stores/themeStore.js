import { create } from 'zustand';

const getInitialTheme = () => {
  const stored = localStorage.getItem('chithhi-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
};

export const useThemeStore = create((set, get) => ({
  theme: getInitialTheme(),

  setTheme: (theme) => {
    localStorage.setItem('chithhi-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  // Call once on mount to sync DOM
  initTheme: () => {
    const theme = get().theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  },
}));
