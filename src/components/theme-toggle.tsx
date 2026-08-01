'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'system' | 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved && ['system', 'light', 'dark'].includes(saved)) {
      setTheme(saved);
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);

    const root = document.documentElement;
    if (newTheme === 'system') {
      root.removeAttribute('data-theme');
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (systemDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    } else if (newTheme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    } else {
      root.setAttribute('data-theme', 'light');
      root.classList.remove('dark');
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (localStorage.getItem('theme') === 'system' || !localStorage.getItem('theme')) {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--bg)] p-0.5 text-xs">
        <div className="h-5 w-16" />
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Выбор темы"
      className="inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--bg)] p-0.5 text-xs text-[var(--muted)]"
    >
      <button
        type="button"
        onClick={() => applyTheme('light')}
        title="Светлая тема"
        aria-label="Светлая тема"
        className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
          theme === 'light'
            ? 'bg-[var(--surface)] text-[var(--text)] font-semibold shadow-xs'
            : 'hover:text-[var(--text)]'
        }`}
      >
        <Sun className="h-3 w-3" />
      </button>

      <button
        type="button"
        onClick={() => applyTheme('dark')}
        title="Тёмная тема"
        aria-label="Тёмная тема"
        className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
          theme === 'dark'
            ? 'bg-[var(--surface)] text-[var(--text)] font-semibold shadow-xs'
            : 'hover:text-[var(--text)]'
        }`}
      >
        <Moon className="h-3 w-3" />
      </button>

      <button
        type="button"
        onClick={() => applyTheme('system')}
        title="Системная тема"
        aria-label="Системная тема"
        className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
          theme === 'system'
            ? 'bg-[var(--surface)] text-[var(--text)] font-semibold shadow-xs'
            : 'hover:text-[var(--text)]'
        }`}
      >
        <Monitor className="h-3 w-3" />
      </button>
    </div>
  );
}
