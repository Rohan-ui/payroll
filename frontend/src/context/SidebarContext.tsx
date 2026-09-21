import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type SidebarMode = 'full' | 'symbol';

interface SidebarContextType {
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
  toggleMode: () => void;
  cycleMode: () => void; // alias for compatibility
  isFull: boolean;
  isSymbol: boolean;
  isHidden: boolean; // false for backwards compatibility
}

const STORAGE_KEY = 'rnd_payroll_sidebar_mode';

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<SidebarMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'full' || saved === 'symbol') {
        return saved;
      }
    }
    return 'full';
  });

  const setMode = useCallback((newMode: SidebarMode) => {
    setModeState(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newMode);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: SidebarMode = prev === 'full' ? 'symbol' : 'full';
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, next);
      }
      return next;
    });
  }, []);

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle between full and symbol
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMode]);

  return (
    <SidebarContext.Provider
      value={{
        mode,
        setMode,
        toggleMode,
        cycleMode: toggleMode,
        isFull: mode === 'full',
        isSymbol: mode === 'symbol',
        isHidden: false,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = (): SidebarContextType => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};
