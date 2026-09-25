import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformThemeProvider, readThemePreference, resolveTheme, THEME_STORAGE_KEY } from './PlatformThemeContext';
import { ThemeSwitch } from './ThemeSwitch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A controllable prefers-color-scheme media query; jsdom has none. */
function stubSystemTheme(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: prefersDark,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  window.matchMedia = vi.fn(() => media as unknown as MediaQueryList);
  return {
    set(next: boolean) {
      media.matches = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

function mount() {
  root = createRoot(container);
  act(() =>
    root?.render(
      <PlatformThemeProvider>
        <ThemeSwitch />
      </PlatformThemeProvider>,
    ),
  );
}

function unmount() {
  act(() => root?.unmount());
  root = null;
}

const appliedTheme = () => document.documentElement.getAttribute('data-hq-theme');
const radio = (label: string) => container.querySelector<HTMLButtonElement>(`[role="radio"][title="${label}"]`);
const checked = () => container.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('title');

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-hq-theme');
  document.documentElement.className = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) unmount();
  container.remove();
  vi.restoreAllMocks();
});

describe('Platform HQ theme', () => {
  it('follows the operating system until a choice is made', () => {
    const system = stubSystemTheme(true);
    mount();
    expect(checked()).toBe('System');
    expect(appliedTheme()).toBe('dark');

    system.set(false);
    expect(appliedTheme()).toBe('light');
  });

  it('restores a saved choice over the system setting', () => {
    stubSystemTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    mount();
    expect(checked()).toBe('Light');
    expect(appliedTheme()).toBe('light');
  });

  it('keeps the choice when the portal is mounted again, as after navigation or reload', () => {
    stubSystemTheme(false);
    mount();
    act(() => radio('Dark')?.click());
    expect(appliedTheme()).toBe('dark');

    unmount();
    document.documentElement.removeAttribute('data-hq-theme');
    mount();
    expect(checked()).toBe('Dark');
    expect(appliedTheme()).toBe('dark');
  });

  it('ignores the system setting once Light or Dark is chosen', () => {
    const system = stubSystemTheme(false);
    mount();
    act(() => radio('Dark')?.click());
    system.set(false);
    expect(appliedTheme()).toBe('dark');
  });

  it("saves under the portal's own key and leaves the tenant app's theme alone", () => {
    stubSystemTheme(false);
    window.localStorage.setItem('voogyo_theme', 'dark');
    mount();
    act(() => radio('Light')?.click());

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(window.localStorage.getItem('voogyo_theme')).toBe('dark');
    // The tenant app's dark mode is the `.dark` class; the portal never sets it.
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('treats an unknown saved value as System', () => {
    stubSystemTheme(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readThemePreference()).toBe('system');
  });

  it('still switches when storage is blocked', () => {
    stubSystemTheme(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mount();
    expect(appliedTheme()).toBe('light');
    act(() => radio('Dark')?.click());
    expect(appliedTheme()).toBe('dark');
  });

  it('exposes the choice as a labelled radio group', () => {
    stubSystemTheme(false);
    mount();
    const group = container.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('Colour theme');
    expect([...container.querySelectorAll('[role="radio"]')].map((element) => element.textContent)).toEqual([
      'Light',
      'Dark',
      'System',
    ]);
  });

  describe('pre-paint script', () => {
    const script = readFileSync(join(process.cwd(), 'public', 'hq-theme.js'), 'utf8');

    it.each([
      [null, true],
      [null, false],
      ['light', true],
      ['dark', false],
      ['system', true],
      ['system', false],
      ['purple', false],
    ])('applies the same theme as the app (saved %s, system dark %s)', (saved, prefersDark) => {
      stubSystemTheme(prefersDark);
      if (saved) window.localStorage.setItem(THEME_STORAGE_KEY, saved);
      new Function(script)();
      expect(appliedTheme()).toBe(resolveTheme(readThemePreference(), prefersDark));
    });
  });
});
