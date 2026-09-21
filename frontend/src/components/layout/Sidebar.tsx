import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  FileText,
  BarChart2,
  Settings,
  HelpCircle,
  LogOut,
  Banknote,
  Building2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePayroll } from '../../context/PayrollContext';
import { useSidebar } from '../../context/SidebarContext';
import type { AppView } from '../../types/payroll.types';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../utils/cn';

interface NavItem {
  id: AppView;
  label: string;
  icon: React.ElementType;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',  label: 'Dashboard',   icon: LayoutDashboard, roles: ['ADMIN', 'HR_ACCOUNTANT', 'MANAGER', 'EMPLOYEE'] },
  { id: 'people',     label: 'People',       icon: Users,           roles: ['ADMIN', 'HR_ACCOUNTANT', 'MANAGER'] },
  { id: 'payroll',    label: 'Payroll',      icon: Banknote,        roles: ['ADMIN', 'HR_ACCOUNTANT'] },
  { id: 'attendance', label: 'Attendance',   icon: CalendarDays,    roles: ['ADMIN', 'HR_ACCOUNTANT', 'MANAGER', 'EMPLOYEE'] },
  { id: 'payslips',   label: 'Payslips',     icon: FileText,        roles: ['ADMIN', 'HR_ACCOUNTANT', 'MANAGER', 'EMPLOYEE'] },
  { id: 'bookkeeping',label: 'Bookkeeping',  icon: BookOpen,        roles: ['ADMIN', 'HR_ACCOUNTANT'] },
  { id: 'reports',    label: 'Reports',      icon: BarChart2,       roles: ['ADMIN', 'HR_ACCOUNTANT'] },
  { id: 'settings',   label: 'Compliance',   icon: Settings,        roles: ['ADMIN', 'HR_ACCOUNTANT'] },
  { id: 'help',       label: 'Help',         icon: HelpCircle,      roles: ['ADMIN', 'HR_ACCOUNTANT', 'MANAGER', 'EMPLOYEE'] },
];

export const Sidebar: React.FC = () => {
  const { user, logout, activeTenant } = useAuth();
  const { currentView, setCurrentView, role } = usePayroll();
  const { isFull, isSymbol, toggleMode } = useSidebar();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role ?? ''));

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col min-h-screen bg-[#0E5A47] text-white shrink-0 shadow-sidebar transition-all duration-300 ease-in-out select-none relative z-30 overflow-x-hidden',
        isFull ? 'w-60' : 'w-[72px]',
      )}
      aria-label="Main navigation"
    >
      {/* ── Header: Brand & Slide Toggle Control ─────────────────────── */}
      <div
        className={cn(
          'border-b border-[#0E6E53]/60 transition-all duration-300',
          isFull ? 'px-4 pt-5 pb-4' : 'px-2 pt-5 pb-3 flex flex-col items-center',
        )}
      >
        {isFull ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center shrink-0 shadow-sm">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white leading-tight truncate">
                  {activeTenant?.legalName ?? activeTenant?.displayName ?? 'RND Technosoft'}
                </p>
                <p className="text-[10px] text-teal-300 font-medium uppercase tracking-wide truncate">
                  Payroll
                </p>
              </div>
            </div>

            {/* Collapse to Symbols Toggle Button */}
            <button
              onClick={toggleMode}
              title="Collapse to symbols (Ctrl+B)"
              aria-label="Collapse to symbols"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-teal-200 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 w-full">
            <div
              className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center shrink-0 shadow-sm"
              title={activeTenant?.legalName ?? activeTenant?.displayName ?? 'Payroll'}
            >
              <Building2 className="w-5 h-5 text-white" />
            </div>

            {/* Expand to Full Names Toggle Button */}
            <button
              onClick={toggleMode}
              title="Expand sidebar (show full module names - Ctrl+B)"
              aria-label="Expand sidebar"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-teal-200 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Navigation Items ───────────────────────────────────────── */}
      <nav
        className={cn(
          'flex-1 py-4 overflow-y-auto sidebar-scroll transition-all duration-300',
          isFull ? 'px-3' : 'px-2',
        )}
        aria-label="Sidebar"
      >
        <ul className="space-y-1" role="list">
          {visibleItems.map((item) => {
            const isActive =
              currentView === item.id || (currentView === 'employee-detail' && item.id === 'people');

            if (isSymbol) {
              return (
                <li key={item.id} className="relative group">
                  <button
                    onClick={() => setCurrentView(item.id)}
                    className={cn(
                      'w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                      isActive
                        ? 'bg-teal-500/25 text-white shadow-inner ring-1 ring-teal-400/40'
                        : 'text-teal-100/80 hover:bg-white/10 hover:text-white',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                  >
                    <item.icon
                      className={cn(
                        'w-5 h-5 shrink-0 transition-colors',
                        isActive ? 'text-teal-300' : 'text-teal-200/80',
                      )}
                    />
                  </button>

                  {/* Accessible tooltip in symbol mode */}
                  <div
                    role="tooltip"
                    className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 transform group-hover:translate-x-0 -translate-x-1"
                  >
                    {item.label}
                  </div>
                </li>
              );
            }

            return (
              <li key={item.id}>
                <button
                  onClick={() => setCurrentView(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
                    isActive
                      ? 'bg-teal-500/20 text-white'
                      : 'text-teal-100/80 hover:bg-white/10 hover:text-white',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon
                    className={cn(
                      'w-4 h-4 shrink-0 transition-colors',
                      isActive ? 'text-teal-400' : 'text-teal-300/70',
                    )}
                  />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Footer: User & Sign Out ─────────────────────────────────── */}
      <div
        className={cn(
          'border-t border-[#0E6E53]/60 transition-all duration-300',
          isFull ? 'px-3 pb-5 pt-3' : 'px-2 pb-5 pt-3 flex flex-col items-center gap-3',
        )}
      >
        {isFull ? (
          <>
            <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
              <Avatar
                name={user?.displayName ?? 'User'}
                size="sm"
                status="active"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{user?.displayName ?? 'Admin'}</p>
                <p className="text-[10px] text-teal-300 truncate capitalize">
                  {role?.toLowerCase().replace('_', ' ')}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-teal-200 hover:bg-white/10 hover:text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </>
        ) : (
          <>
            <div className="relative group">
              <Avatar
                name={user?.displayName ?? 'User'}
                size="sm"
                status="active"
              />
              <div
                role="tooltip"
                className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150"
              >
                {user?.displayName ?? 'Admin'} ({role?.toLowerCase().replace('_', ' ')})
              </div>
            </div>

            <div className="relative group">
              <button
                onClick={logout}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-teal-200 hover:bg-white/10 hover:text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <div
                role="tooltip"
                className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150"
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
