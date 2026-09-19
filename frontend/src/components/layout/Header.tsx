import React, { useState } from 'react';
import { Menu, X, Bell, Search, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePayroll } from '../../context/PayrollContext';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../utils/cn';
import type { AppView } from '../../types/payroll.types';

/** Mobile-only top bar. Hidden on md+ (desktop uses Sidebar). */
export const Header: React.FC = () => {
  const { user, logout, activeTenant } = useAuth();
  const { currentView, setCurrentView } = usePayroll();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems: { id: AppView; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'people', label: 'People' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'payslips', label: 'Payslips' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Compliance' },
    { id: 'help', label: 'Help' },
  ];

  return (
    <>
      {/* Topbar — hidden on md+ */}
      <header className="md:hidden sticky top-0 z-40 bg-[#0E5A47] text-white px-4 py-3 flex items-center justify-between shadow-md">
        {/* Left: hamburger + brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-teal-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-teal-500 flex items-center justify-center">
              <Building2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-white">{activeTenant?.legalName ?? activeTenant?.displayName ?? 'Payroll'}</span>
          </div>
        </div>

        {/* Right: notifications + avatar */}
        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
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
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <nav
            className="relative w-64 bg-[#0E5A47] h-full flex flex-col shadow-2xl"
            aria-label="Mobile navigation"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-[#0E6E53]/60">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-teal-500 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-bold text-white">{activeTenant?.legalName ?? activeTenant?.displayName ?? 'Payroll'}</span>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav items */}
            <ul className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {navItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => { setCurrentView(item.id); setMenuOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                        isActive
                          ? 'bg-teal-500/20 text-white'
                          : 'text-teal-100/80 hover:bg-white/10 hover:text-white',
                      )}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Footer */}
            <div className="px-3 pb-5 pt-3 border-t border-[#0E6E53]/60">
              <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
                <Avatar name={user?.displayName ?? 'User'} size="sm" status="active" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{user?.displayName ?? 'Admin'}</p>
                </div>
              </div>
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs text-teal-200 hover:bg-white/10 hover:text-white transition-all duration-150"
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
