import React, { useState, useEffect } from 'react';
import {
  AtSign,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePayroll } from '../../context/PayrollContext';
import { useSidebar } from '../../context/SidebarContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../utils/cn';
import { currentNavigationId, sidebarTree, type SidebarItem } from './navigation';

export const Sidebar: React.FC = () => {
  const { user, logout, activeTenant, navigation } = useAuth();
  const { currentView, crmTab, navigateTo, setCurrentView, role } = usePayroll();
  const { isFull, isSymbol, toggleMode } = useSidebar();
  const { theme, setTheme, toggleTheme } = useTheme();

  // Only what the server says this member may open, with its module switched
  // on, grouped and ordered as the server sends it. A group with no permitted
  // items is absent, because the server omits it.
  const items = sidebarTree(navigation);
  const activeId = currentNavigationId(currentView, crmTab);
  const activeGroup = items.find((item) => item.children.some((child) => child.entry.id === activeId))?.entry.id ?? null;

  // Keep a group open only while one of its items is on screen; collapse otherwise.
  const [expandedGroup, setExpandedGroup] = useState<string | null>(activeGroup);
  useEffect(() => {
    setExpandedGroup(activeGroup);
  }, [activeGroup]);

  // A group opens its first item.
  const open = (item: SidebarItem) => {
    const target = item.presentation.view ? item : item.children[0];
    if (target?.presentation.view) navigateTo(target.presentation.view, target.presentation.tab);
  };

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-screen max-h-screen sticky top-0 shrink-0 select-none relative z-30 overflow-hidden transition-all duration-300 ease-in-out',
        theme === 'dark'
          ? 'bg-[#181724] text-white border-r border-[#2B293E] shadow-sidebar'
          : 'bg-white text-slate-800 border-r border-slate-200 shadow-sm',
        isFull ? 'w-60' : 'w-[68px]',
      )}
      aria-label="Main navigation"
    >
      {/* ── Header: Brand Logo & Slide Toggle Control ─────────────────────── */}
      <div
        className={cn(
          'shrink-0 border-b transition-all duration-300',
          theme === 'dark' ? 'border-[#2B293E]' : 'border-slate-200',
          isFull ? 'px-3 pt-3 pb-2' : 'px-1.5 pt-3 pb-2 flex flex-col items-center',
        )}
      >
        {isFull ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              {/* Voogyo Wordmark Logo - Transparent background, no white container */}
              <div className="flex items-center justify-center shrink-0">
                <img
                  src={theme === 'dark' ? '/voogyo-woodmark-white.png' : '/voogyo-woodmark.png'}
                  alt="Voogyo"
                  className="h-5 w-auto object-contain bg-transparent"
                />
              </div>

              {/* Collapse to Symbols Toggle Button */}
<button
  onClick={toggleMode}
  title="Collapse to symbols (Ctrl+B)"
  aria-label="Collapse to symbols"
  className={cn(
    'w-6 h-6 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 shrink-0',
    theme === 'dark'
      ? 'text-slate-400 hover:text-white hover:bg-white/10'
      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
  )}
>
  <span className="flex items-center ">
    <ChevronLeft className="w-3.5 h-3.5" />
    <ChevronLeft className="w-3.5 h-3.5 -ml-5" />
  </span>
</button>
            </div>

            <div className="flex items-center justify-between gap-1.5 min-w-0 px-0.5">
              <p
                className={cn(
                  'text-[11px] font-semibold leading-tight truncate',
                  theme === 'dark' ? 'text-slate-300' : 'text-slate-600',
                )}
                title={activeTenant?.legalName ?? activeTenant?.displayName ?? 'Voogyo OS'}
              >
                {activeTenant?.legalName ?? activeTenant?.displayName ?? 'Voogyo OS'}
              </p>
              <span className="text-[8px] text-teal-400 font-bold uppercase tracking-wider shrink-0 bg-teal-500/10 px-1 py-0.2 rounded border border-teal-500/20">
                OS
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 w-full">
            {/* Symbol Logo - Clean transparent, no white box */}
            <div
              className="w-10 h-10 flex items-center justify-center shrink-0"
              title={activeTenant?.legalName ?? 'Voogyo'}
            >
              <img
                src="/voogyo-mark.png"
                alt="Voogyo"
                className="w-8 h-8 object-contain bg-transparent"
              />
            </div>

            {/* Expand to Full Names Toggle Button */}
<button
  onClick={toggleMode}
  title="Expand sidebar (show full module names - Ctrl+B)"
  aria-label="Expand sidebar"
  className={cn(
    'w-7 h-7 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
    theme === 'dark'
      ? 'text-slate-400 hover:text-white hover:bg-white/10'
      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
  )}
>
  <ChevronRight className="w-4 h-4" />
  <ChevronRight className="w-4 h-4 -ml-2.5" />
</button>
          </div>
        )}
      </div>

      {/* ── Navigation Items ───────────────────────────────────────── */}
      <nav
        className={cn(
          'flex-1 min-h-0 py-2 overflow-y-auto sidebar-scroll transition-all duration-300',
          isFull ? 'px-2.5' : 'px-1.5',
        )}
        aria-label="Sidebar"
      >
        <ul className="space-y-0.5" role="list">
          {items.map((item) => {
            const { entry } = item;
            const Icon = item.presentation.icon;
            const isItemActive = entry.id === activeId;
            const isGroupActive = entry.id === activeGroup;

            // A business module (or CRM & Sales): a group of the items the member may open.
            if (item.children.length > 0) {
              const isExpanded = expandedGroup === entry.id;
              if (isSymbol) {
                return (
                  <li key={entry.id} className="relative group">
                    <button
                      onClick={() => open(item)}
                      className={cn(
                        'w-full flex items-center justify-center py-2 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                        isGroupActive
                          ? 'bg-teal-500/20 text-teal-300 shadow-inner ring-1 ring-teal-500/40'
                          : 'text-slate-400 hover:bg-white/10 hover:text-white',
                      )}
                      aria-current={isGroupActive ? 'page' : undefined}
                      aria-label={entry.label}
                    >
                      <Icon
                        className={cn(
                          'w-4 h-4 shrink-0 transition-colors',
                          isGroupActive ? 'text-teal-400' : 'text-slate-400',
                        )}
                      />
                    </button>

                    {/* Rich Flyout Menu in Symbol Mode */}
                    <div
                      role="tooltip"
                      className={cn(
                        'absolute left-full ml-2 top-0 w-56 rounded-xl shadow-2xl p-1.5 z-50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-150 transform group-hover:translate-x-0 -translate-x-1',
                        theme === 'dark'
                          ? 'bg-[#1E1D2D] border border-[#2B293E] text-white'
                          : 'bg-white border border-slate-200 text-slate-900 shadow-xl',
                      )}
                    >
                      <div
                        className={cn(
                          'px-2.5 py-1 border-b mb-1 flex items-center justify-between',
                          theme === 'dark' ? 'border-[#2B293E]' : 'border-slate-200',
                        )}
                      >
                        <span className={cn('text-xs font-bold', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                          {entry.label}
                        </span>
                        <span className="text-[9px] text-teal-400 font-semibold">Voogyo</span>
                      </div>
                      <div className="space-y-0.5">
                        {item.children.map((sub) => {
                          const isSubActive = sub.entry.id === activeId;
                          return (
                            <button
                              key={sub.entry.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                open(sub);
                              }}
                              className={cn(
                                'w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors text-left',
                                isSubActive
                                  ? theme === 'dark'
                                    ? 'bg-teal-500/20 text-teal-300 font-bold'
                                    : 'bg-teal-50 text-teal-800 font-bold'
                                  : theme === 'dark'
                                  ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <sub.presentation.icon className="w-3.5 h-3.5 shrink-0" />
                                <span>{sub.entry.label}</span>
                              </div>
                              {sub.presentation.badge && (
                                <span
                                  className={cn(
                                    'text-[9px] px-1 py-0.2 rounded font-extrabold',
                                    theme === 'dark'
                                      ? 'bg-teal-500/20 text-teal-300 border border-teal-400/30'
                                      : 'bg-teal-100 text-teal-800 border border-teal-200',
                                  )}
                                >
                                  {sub.presentation.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </li>
                );
              }

              // Full sidebar expanded mode
              return (
                <li key={entry.id} className="space-y-0.5">
                  <button
                    onClick={() => {
                      setExpandedGroup((prev) => (prev === entry.id ? null : entry.id));
                      if (!isGroupActive) {
                        open(item);
                      }
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                      isGroupActive
                        ? theme === 'dark'
                          ? 'bg-teal-500/15 text-white font-semibold'
                          : 'bg-teal-50 text-teal-800 font-semibold border border-teal-200/80'
                        : theme === 'dark'
                        ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={cn(
                          'w-4 h-4 shrink-0 transition-colors',
                          isGroupActive ? 'text-teal-400' : 'text-slate-400',
                        )}
                      />
                      <span className="truncate whitespace-nowrap">{entry.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isGroupActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                      )}
                      <ChevronDown
                        className={cn(
                          'w-3.5 h-3.5 text-slate-400 transition-transform duration-200',
                          isExpanded ? 'rotate-180 text-teal-400' : '',
                        )}
                      />
                    </div>
                  </button>

                  {/* Sub-Navigation Links */}
                  {isExpanded && (
                    <ul
                      className={cn(
                        'pl-2.5 pr-0.5 py-0.5 space-y-0.5 border-l ml-3 animate-in fade-in slide-in-from-top-1 duration-150',
                        theme === 'dark' ? 'border-[#2B293E]' : 'border-slate-200',
                      )}
                    >
                      {item.children.map((sub) => {
                        const isSubActive = sub.entry.id === activeId;

                        return (
                          <li key={sub.entry.id}>
                            <button
                              onClick={() => open(sub)}
                              className={cn(
                                'w-full flex items-center justify-between px-2 py-1 rounded-md text-[11px] transition-all duration-150',
                                isSubActive
                                  ? theme === 'dark'
                                    ? 'bg-teal-500/25 text-white font-bold shadow-2xs'
                                    : 'bg-teal-100 text-teal-900 font-bold border border-teal-200/80'
                                  : theme === 'dark'
                                  ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
                              )}
                              title={sub.entry.label}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <sub.presentation.icon
                                  className={cn(
                                    'w-3 h-3 shrink-0',
                                    isSubActive ? 'text-teal-400' : 'text-slate-500',
                                  )}
                                />
                                <span className="truncate">{sub.entry.label}</span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {sub.presentation.badge && (
                                  <span
                                    className={cn(
                                      'text-[8px] px-1 py-0.1 rounded font-extrabold shrink-0',
                                      isSubActive
                                        ? theme === 'dark'
                                          ? 'bg-teal-400 text-slate-950'
                                          : 'bg-teal-600 text-white'
                                        : theme === 'dark'
                                        ? 'bg-slate-800 text-teal-300 border border-teal-500/30'
                                        : 'bg-teal-50 text-teal-700 border border-teal-200',
                                    )}
                                  >
                                    {sub.presentation.badge}
                                  </span>
                                )}
                                {sub.presentation.hasPlus && (
                                  <span
                                    className={cn(
                                      'w-3 h-3 rounded flex items-center justify-center transition-colors',
                                      theme === 'dark'
                                        ? 'text-slate-500 hover:text-white'
                                        : 'text-slate-400 hover:text-slate-900 hover:bg-slate-200/60',
                                    )}
                                    title={`New ${sub.entry.label}`}
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                  </span>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }

            // Other standard navigation items
            if (isSymbol) {
              return (
                <li key={entry.id} className="relative group">
                  <button
                    onClick={() => open(item)}
                    className={cn(
                      'w-full flex items-center justify-center py-2 rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                      isItemActive
                        ? theme === 'dark'
                          ? 'bg-teal-500/20 text-white shadow-inner ring-1 ring-teal-500/40'
                          : 'bg-teal-50 text-teal-800 font-semibold ring-1 ring-teal-300'
                        : theme === 'dark'
                        ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                    )}
                    aria-current={isItemActive ? 'page' : undefined}
                    aria-label={entry.label}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isItemActive ? 'text-teal-400' : 'text-slate-400',
                      )}
                    />
                  </button>

                  {/* Accessible tooltip in symbol mode */}
                  <div
                    role="tooltip"
                    className={cn(
                      'absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 transform group-hover:translate-x-0 -translate-x-1',
                      theme === 'dark'
                        ? 'bg-[#1E1D2D] text-white border border-[#2B293E]'
                        : 'bg-slate-900 text-white border border-slate-800',
                    )}
                  >
                    {entry.label}
                  </div>
                </li>
              );
            }

            return (
              <li key={entry.id}>
                <button
                  onClick={() => open(item)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                    isItemActive
                      ? theme === 'dark'
                        ? 'bg-teal-500/15 text-white font-semibold'
                        : 'bg-teal-50 text-teal-800 font-semibold border border-teal-200/80'
                      : theme === 'dark'
                      ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                  aria-current={isItemActive ? 'page' : undefined}
                >
                  <Icon
                    className={cn(
                      'w-4 h-4 shrink-0 transition-colors',
                      isItemActive ? 'text-teal-400' : 'text-slate-400',
                    )}
                  />
                  <span className="truncate whitespace-nowrap">{entry.label}</span>
                  {isItemActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Footer: Theme Toggle, User & Sign Out ─────────────────────────────────── */}
      <div
        className={cn(
          'shrink-0 border-t transition-all duration-300 mt-auto',
          theme === 'dark' ? 'border-[#2B293E]' : 'border-slate-200',
          isFull ? 'px-2.5 pb-2.5 pt-2' : 'px-1.5 pb-2.5 pt-2 flex flex-col items-center gap-1.5',
        )}
      >
        {isFull ? (
          <>
            {/* Theme Toggle Segmented Control (Full Mode) */}
            <div
              className={cn(
                'flex items-center p-0.5 rounded-lg border mb-1.5 transition-colors select-none',
                theme === 'dark'
                  ? 'bg-[#12111D] border-[#2B293E]'
                  : 'bg-slate-100 border-slate-200',
              )}
              role="group"
              aria-label="Theme mode switcher"
            >
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs font-semibold transition-all duration-150',
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200',
                )}
                aria-label="Switch to Light mode"
                aria-pressed={theme === 'light'}
              >
                <Sun className={cn('w-3.5 h-3.5', theme === 'light' ? 'text-amber-500' : 'text-slate-400')} />
                <span className="text-[11px]">Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs font-semibold transition-all duration-150',
                  theme === 'dark'
                    ? 'bg-[#1E1D2D] text-white shadow-xs border border-[#2B293E]'
                    : 'text-slate-500 hover:text-slate-800',
                )}
                aria-label="Switch to Dark mode"
                aria-pressed={theme === 'dark'}
              >
                <Moon className={cn('w-3.5 h-3.5', theme === 'dark' ? 'text-indigo-400' : 'text-slate-400')} />
                <span className="text-[11px]">Dark</span>
              </button>
            </div>

            <div className="flex items-center gap-2 px-1.5 py-1 mb-0.5">
              <Avatar
                name={user?.displayName ?? 'User'}
                size="sm"
                status="active"
              />
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-semibold truncate leading-tight', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                  {user?.displayName ?? 'Admin'}
                </p>
                <p className="text-[9px] text-teal-400 truncate capitalize font-medium leading-none mt-0.5">
                  {role?.toLowerCase().replace('_', ' ')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCurrentView('my-email')}
              aria-current={currentView === 'my-email' ? 'page' : undefined}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                theme === 'dark'
                  ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <AtSign className="w-3.5 h-3.5" />
              <span className="text-[11px]">My email settings</span>
            </button>
            <button
              onClick={logout}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                theme === 'dark'
                  ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-[11px]">Sign out</span>
            </button>
          </>
        ) : (
          <>
            {/* Theme Toggle Button (Symbol Mode) */}
            <div className="relative group">
              <button
                onClick={toggleTheme}
                type="button"
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                  theme === 'dark'
                    ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
                aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-600" />
                )}
              </button>
              <div
                role="tooltip"
                className={cn(
                  'absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150',
                  theme === 'dark'
                    ? 'bg-[#1E1D2D] text-white border border-[#2B293E]'
                    : 'bg-slate-900 text-white border border-slate-800',
                )}
              >
                Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
              </div>
            </div>

            <div className="relative group">
              <Avatar
                name={user?.displayName ?? 'User'}
                size="sm"
                status="active"
              />
              <div
                role="tooltip"
                className={cn(
                  'absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-semibold rounded-lg shadow-xl border whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150',
                  theme === 'dark'
                    ? 'bg-[#1E1D2D] text-white border-[#2B293E]'
                    : 'bg-slate-900 text-white border-slate-800',
                )}
              >
                {user?.displayName ?? 'Admin'} ({role?.toLowerCase().replace('_', ' ')})
              </div>
            </div>

            <div className="relative group">
              <button
                type="button"
                onClick={() => setCurrentView('my-email')}
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                  theme === 'dark'
                    ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
                aria-label="My email settings"
              >
                <AtSign className="w-4 h-4" />
              </button>
              <div
                role="tooltip"
                className={cn(
                  'absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-semibold rounded-lg shadow-xl border whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150',
                  theme === 'dark'
                    ? 'bg-[#1E1D2D] text-white border-[#2B293E]'
                    : 'bg-slate-900 text-white border-slate-800',
                )}
              >
                My email settings
              </div>
            </div>

            <div className="relative group">
              <button
                onClick={logout}
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                  theme === 'dark'
                    ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <div
                role="tooltip"
                className={cn(
                  'absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 text-xs font-semibold rounded-lg shadow-xl border whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150',
                  theme === 'dark'
                    ? 'bg-[#1E1D2D] text-white border-[#2B293E]'
                    : 'bg-slate-900 text-white border-slate-800',
                )}
              >
                Sign out
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
