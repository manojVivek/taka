'use client';

import { useEffect, useState } from 'react';
import { Ico } from './Icons';
import { IconButton } from './Button';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const current = document.documentElement.classList.contains('theme-light') ? 'light' : 'dark';
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (next === 'light') {
      document.documentElement.classList.add('theme-light');
    } else {
      document.documentElement.classList.remove('theme-light');
    }
    try {
      localStorage.setItem('taka-theme', next);
    } catch {
      // ignore storage failures
    }
    setTheme(next);
  };

  return (
    <IconButton onClick={toggle} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
      {theme === 'dark' ? <Ico.Moon style={{ width: 14, height: 14 }} /> : <Ico.Sun style={{ width: 14, height: 14 }} />}
    </IconButton>
  );
}
