import React, { useState } from 'react';
import { Menu, X, Bell, ChevronDown, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePayroll } from '../../context/PayrollContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../utils/cn';
import { currentNavigationId, sidebarTree } from './navigation';


/** Mobile-only top bar. Hidden on md+ (desktop uses Sidebar). */
export const Header: React.FC = () => {
  const { user, logout, activeTenant, navigation } = useAuth();
  const { currentView, setCurrentView, crmTab, navigateTo } = usePayroll();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  // Only what the server says this member may open, as in the sidebar.
  const items = sidebarTree(navigation);
  const activeId = currentNavigationId(currentView, crmTab);
  const [openGroup, setOpenGroup] = useState<string | null>(items.find((i) => i.children.some((c) => c.entry.id === activeId))?.entry.id ?? null);

  return (
    <>
      {/* Topbar — hidden on md+ */}
      <header
        className={cn(
          'md:hidden sticky top-0 z-40 px-4 py-2.5 flex items-center justify-between shadow-md border-b transition-colors',
          theme === 'dark'
            ? 'bg-[#181724] text-white border-[#2B293E]'
            : 'bg-white text-slate-800 border-slate-200',
        )}
      >
        {/* Left: hamburger + brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen(true)}
            className={cn(
              'w-9 h-9 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
              theme === 'dark' ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100',
            )}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            {/* Logo without white box background */}
            <div className="flex items-center justify-center shrink-0">
              <img
                src={theme === 'dark' ? '/voogyo-woodmark-white.png' : '/voogyo-woodmark.png'}
                alt="Voogyo"
                className="h-5 w-auto object-contain bg-transparent"
              />
            </div>
          </div>
        </div>

        {/* Right: theme toggle + notifications + avatar */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            type="button"
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
              theme === 'dark' ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100',
            )}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600" />
            )}
          </button>
          <button
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
              theme === 'dark' ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100',
            )}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <Avatar name={user?.displayName ?? 'User'} size="sm" status="active" />
        </div>
      </header>

      {/* Mobile slide-over menu */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <nav
            className={cn(
              'relative w-72 h-full flex flex-col shadow-2xl border-r transition-colors',
              theme === 'dark'
                ? 'bg-[#181724] text-white border-[#2B293E]'
                : 'bg-white text-slate-800 border-slate-200',
            )}
            aria-label="Mobile navigation"
          >
            {/* Header */}
            <div
              className={cn(
                'flex items-center justify-between px-4 py-3.5 border-b',
                theme === 'dark' ? 'border-[#2B293E]' : 'border-slate-200',
              )}
            >
              <div className="flex items-center justify-center shrink-0">
                <img
                  src={theme === 'dark' ? '/voogyo-woodmark-white.png' : '/voogyo-woodmark.png'}
                  alt="Voogyo"
                  className="h-5 w-auto object-contain bg-transparent"
                />
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                  theme === 'dark' ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100',
                )}
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* The same items as the sidebar: only what the server says this member may open. */}
            <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-3">
              <ul className="space-y-1">
                {items.map((item) => {
                  const inGroup = item.children.some((child) => child.entry.id === activeId);
                  const isActive = item.entry.id === activeId || inGroup;
                  const expanded = openGroup === item.entry.id;
                  const rowClass = (active: boolean) => cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                    active
                      ? theme === 'dark' ? 'bg-teal-500/20 text-white' : 'bg-teal-50 text-teal-900'
                      : theme === 'dark' ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  );
                  if (item.children.length === 0) {
                    return (
                      <li key={item.entry.id}>
                        <button type="button" aria-current={isActive ? 'page' : undefined} className={rowClass(isActive)}
                          onClick={() => { if (item.presentation.view) navigateTo(item.presentation.view, item.presentation.tab); setMenuOpen(false); }}>
                          <item.presentation.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {item.entry.label}
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={item.entry.id}>
                      <button type="button" aria-expanded={expanded} className={cn(rowClass(isActive && !expanded), 'justify-between')}
                        onClick={() => setOpenGroup(expanded ? null : item.entry.id)}>
                        <span className="flex items-center gap-2"><item.presentation.icon className="h-4 w-4 shrink-0" aria-hidden="true" />{item.entry.label}</span>
                        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                      </button>
                      {expanded && (
                        <ul className={cn('ml-4 mt-1 space-y-0.5 border-l pl-3', theme === 'dark' ? 'border-[#2B293E]' : 'border-slate-200')}>
                          {item.children.map((child) => {
                            const childActive = child.entry.id === activeId;
                            return (
                              <li key={child.entry.id}>
                                <button type="button" aria-current={childActive ? 'page' : undefined}
                                  className={cn(rowClass(childActive), 'py-1.5 text-[13px]')}
                                  onClick={() => { if (child.presentation.view) navigateTo(child.presentation.view, child.presentation.tab); setMenuOpen(false); }}>
                                  <child.presentation.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  {child.entry.label}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Footer */}
            <div
              className={cn(
                'px-3 pb-5 pt-3 border-t',
                theme === 'dark' ? 'border-[#2B293E]' : 'border-slate-200',
              )}
            >
              <button
                onClick={toggleTheme}
                type="button"
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 mb-2 border',
                  theme === 'dark'
                    ? 'bg-white/5 text-slate-300 border-[#2B293E]'
                    : 'bg-slate-100 text-slate-700 border-slate-200',
                )}
              >
                <div className="flex items-center gap-2">
                  {theme === 'dark' ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-indigo-600" />
                  )}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </div>
                <span className="font-bold text-[10px] uppercase">
                  {theme}
                </span>
              </button>

              <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
                <Avatar name={user?.displayName ?? 'User'} size="sm" status="active" />
                <div className="min-w-0">
                  <p className={cn('text-xs font-semibold truncate', theme === 'dark' ? 'text-white' : 'text-slate-900')}>
                    {user?.displayName ?? 'Admin'}
                  </p>
                  <p className="text-[10px] text-teal-400 truncate">Voogyo User</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setCurrentView('my-email'); setMenuOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-xl text-xs transition-colors',
                  theme === 'dark' ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                My email settings
              </button>
              <button
                onClick={() => { void logout(); setMenuOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-xl text-xs transition-colors',
                  theme === 'dark' ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
};
