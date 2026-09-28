import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** The portal's own key: the tenant app keeps its theme under a different one. */
export const THEME_STORAGE_KEY = 'voogyo_platform_theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readThemePreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

const systemPrefersDark = () => {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return true;
  }
};

interface PlatformThemeValue {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const PlatformThemeContext = createContext<PlatformThemeValue | null>(null);

/**
 * One theme for the whole portal. The saved choice is applied to <html> as
 * data-hq-theme, which the semantic colour tokens in index.css read; public/
 * hq-theme.js applies the same choice before the first paint.
 */
export const PlatformThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);
  const theme = resolveTheme(preference, prefersDark);

  // Follow the operating system while the preference is "system".
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const update = () => setPrefersDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-hq-theme', theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts for this visit only.
    }
  }, []);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);
  return <PlatformThemeContext.Provider value={value}>{children}</PlatformThemeContext.Provider>;
};

export function usePlatformTheme(): PlatformThemeValue {
  const value = useContext(PlatformThemeContext);
  if (!value) throw new Error('usePlatformTheme must be used inside PlatformThemeProvider');
  return value;
}
