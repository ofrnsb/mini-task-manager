import { useEffect, useState } from 'react';

/** 'system' follows the OS setting, like Apple's Automatic appearance. */
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'mtm-theme';
const query = '(prefers-color-scheme: dark)';

function savedTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Storage can be blocked (private mode); fall back to the system setting.
  }
  return 'system';
}

const systemIsDark = () => window.matchMedia?.(query)?.matches ?? false;

/** Theme lives on <html data-theme>; without the attribute, CSS follows the OS. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [osDark, setOsDark] = useState(systemIsDark);

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    const onChange = () => setOsDark(mq.matches);
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  }, [theme]);

  const resolved: 'light' | 'dark' = theme === 'system' ? (osDark ? 'dark' : 'light') : theme;
  return { theme, resolved, setTheme };
}
