'use client';

import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  mounted: boolean;
}

const THEME_STORAGE_KEY = 'solarithm_theme_mode';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  mounted: false,
});

export const useTheme = () => useContext(ThemeContext);

let currentTheme: ThemeMode = 'dark';
const listeners = new Set<() => void>();

function getSnapshot(): ThemeMode {
  return currentTheme;
}

function getServerSnapshot(): ThemeMode {
  return 'dark';
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function updateDomTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;

  if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
    if (body) {
      body.classList.remove('dark');
      body.classList.add('light');
    }
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
    if (body) {
      body.classList.remove('light');
      body.classList.add('dark');
    }
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        currentTheme = saved;
        updateDomTheme(saved);
        listeners.forEach(l => l());
      } else {
        updateDomTheme(currentTheme);
      }
    } catch {
      updateDomTheme(currentTheme);
    }
  }, []);

  const setTheme = (mode: ThemeMode) => {
    currentTheme = mode;
    updateDomTheme(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (err) {
      console.warn('Failed to save theme preference in localStorage:', err);
    }
    listeners.forEach(l => l());
  };

  const toggleTheme = () => {
    const nextMode: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextMode);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, mounted: true }}>
      {children}
    </ThemeContext.Provider>
  );
}
