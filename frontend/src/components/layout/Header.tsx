import React, { useState } from 'react';
import { Menu, X, Bell, ChevronDown, Sparkles, Kanban, Mail, Clock, FileText, BarChart2, Settings2, Target, ShieldCheck, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePayroll } from '../../context/PayrollContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../utils/cn';
import type { AppView, CrmTab } from '../../types/payroll.types';

const CRM_SUB_ITEMS = [
  { id: 'cold-funnel', label: 'Client Outreach',      view: 'crm' as AppView,    tab: 'cold-funnel' as CrmTab, icon: Sparkles, badge: '30D' },
  { id: 'pipeline',    label: 'Sales Pipelines',      view: 'crm' as AppView,    tab: 'pipeline' as CrmTab,    icon: Kanban },
  { id: 'emails',      label: 'Email & Marketing',    view: 'emails' as AppView,                               icon: Mail,     badge: 'New' },
  { id: 'activities',  label: 'Follow-ups & Meetings', view: 'crm' as AppView,    tab: 'activities' as CrmTab,  icon: Clock },
  { id: 'proposals',   label: 'Quotations',           view: 'crm' as AppView,    tab: 'proposals' as CrmTab,   icon: FileText },
  { id: 'reports',     label: 'Reports & Analytics',  view: 'crm' as AppView,    tab: 'reports' as CrmTab,     icon: BarChart2 },
  { id: 'masters',     label: 'Masters',              view: 'crm' as AppView,    tab: 'masters' as CrmTab,     icon: Settings2 },
  { id: 'audit-trail', label: 'Audit Trail',          view: 'crm' as AppView,    tab: 'audit-trail' as CrmTab, icon: ShieldCheck },
];

/** Mobile-only top bar. Hidden on md+ (desktop uses Sidebar). */
export const Header: React.FC = () => {
  const { user, logout, activeTenant } = useAuth();
  const { currentView, setCurrentView, crmTab, navigateTo } = usePayroll();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileCrmOpen, setMobileCrmOpen] = useState(true);

  const navItems: { id: AppView; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'organization', label: 'Organization & Settings' },
    { id: 'people', label: 'People' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'payslips', label: 'Payslips' },
    { id: 'bookkeeping', label: 'Bookkeeping' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Compliance' },
    { id: 'super-admin', label: 'Super Admin HQ' },
    { id: 'help', label: 'Help' },
  ];

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

        {/* Right: Platform HQ + theme toggle + notifications + avatar */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentView('super-admin')}
            className={cn(
              'px-2 py-1 flex items-center gap-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer',
              currentView === 'super-admin'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                : theme === 'dark'
                ? 'bg-indigo-950/50 text-indigo-300 border-indigo-800/60 hover:bg-indigo-900/50 hover:text-white'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
            )}
            title="Platform Super Admin HQ"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[10px]">HQ</span>
          </button>

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

            {/* Nav items */}
            <ul className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {/* Platform Super Admin HQ Quick Button */}
              <li>
                <button
                  onClick={() => { setCurrentView('super-admin'); setMenuOpen(false); }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-bold transition-all border mb-1.5 cursor-pointer',
                    currentView === 'super-admin'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                      : theme === 'dark'
                      ? 'bg-indigo-950/40 text-indigo-300 border-indigo-800/60 hover:bg-indigo-900/50'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <span>Platform HQ</span>
                  </div>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-black bg-indigo-500/20 text-indigo-300">
                    Super Admin
                  </span>
                </button>
              </li>

              <li>
                <button
                  onClick={() => { setCurrentView('dashboard'); setMenuOpen(false); }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    currentView === 'dashboard'
                      ? theme === 'dark' ? 'bg-teal-500/20 text-white font-bold' : 'bg-teal-50 text-teal-800 font-bold'
                      : theme === 'dark' ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  Dashboard
                </button>
              </li>

              {/* CRM & Sales Expandable Group */}
              <li className="space-y-1">
                <button
                  onClick={() => setMobileCrmOpen((prev) => !prev)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    (currentView === 'crm' || currentView === 'emails')
                      ? theme === 'dark' ? 'bg-teal-500/20 text-teal-300 font-bold' : 'bg-teal-50 text-teal-800 font-bold'
                      : theme === 'dark' ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-teal-400" />
                    <span>CRM &amp; Sales</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-slate-400 transition-transform',
                      mobileCrmOpen ? 'rotate-180 text-teal-400' : '',
                    )}
                  />
                </button>

                {mobileCrmOpen && (
                  <ul
                    className={cn(
                      'pl-4 pr-1 py-1 space-y-0.5 border-l-2 ml-4',
                      theme === 'dark' ? 'border-[#2B293E]' : 'border-slate-200',
                    )}
                  >
                    {CRM_SUB_ITEMS.map((sub) => {
                      const isSubActive =
                        (sub.view === 'emails' && currentView === 'emails') ||
                        (sub.view === 'crm' && currentView === 'crm' && crmTab === sub.tab);

                      return (
                        <li key={sub.id}>
                          <button
                            onClick={() => {
                              navigateTo(sub.view, sub.tab);
                              setMenuOpen(false);
                            }}
                            className={cn(
                              'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors',
                              isSubActive
                                ? theme === 'dark'
                                  ? 'bg-teal-500/25 text-white font-bold'
                                  : 'bg-teal-100 text-teal-900 font-bold'
                                : theme === 'dark'
                                ? 'text-slate-400 hover:text-white hover:bg-white/5'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <sub.icon className="w-3.5 h-3.5" />
                              <span>{sub.label}</span>
                            </div>
                            {sub.badge && (
                              <span
                                className={cn(
                                  'text-[9px] px-1 py-0.2 rounded font-extrabold',
                                  theme === 'dark'
                                    ? 'bg-teal-500/20 text-teal-300'
                                    : 'bg-teal-100 text-teal-800',
                                )}
                              >
                                {sub.badge}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>

              {/* Other modules */}
              {navItems.filter((i) => i.id !== 'dashboard').map((item) => {
                const isActive = currentView === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => { setCurrentView(item.id); setMenuOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                        isActive
                          ? theme === 'dark' ? 'bg-teal-500/20 text-white font-bold' : 'bg-teal-50 text-teal-800 font-bold'
                          : theme === 'dark' ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>

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
                onClick={() => { logout(); setMenuOpen(false); }}
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
