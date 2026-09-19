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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePayroll } from '../../context/PayrollContext';
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
  { id: 'attendance', label: 'Attendance',   icon: CalendarDays,    roles: ['ADMIN', 'HR_ACCOUNTANT', 'MANAGER'] },
  { id: 'payslips',   label: 'Payslips',     icon: FileText,        roles: ['ADMIN', 'HR_ACCOUNTANT', 'MANAGER', 'EMPLOYEE'] },
  { id: 'reports',    label: 'Reports',      icon: BarChart2,       roles: ['ADMIN', 'HR_ACCOUNTANT'] },
  { id: 'settings',   label: 'Compliance',   icon: Settings,        roles: ['ADMIN', 'HR_ACCOUNTANT'] },
  { id: 'help',       label: 'Help',         icon: HelpCircle,      roles: ['ADMIN', 'HR_ACCOUNTANT', 'MANAGER', 'EMPLOYEE'] },
];

export const Sidebar: React.FC = () => {
  const { user, logout, activeTenant } = useAuth();
  const { currentView, setCurrentView, role } = usePayroll();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role ?? ''));

  return (
    <aside
      className="hidden md:flex flex-col w-56 min-h-screen bg-[#0E5A47] text-white shrink-0 shadow-sidebar"
      aria-label="Main navigation"
    >
      {/* Logo / Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-[#0E6E53]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight truncate">
              {activeTenant?.legalName ?? activeTenant?.displayName ?? 'RND Technosoft'}
            </p>
            <p className="text-[10px] text-teal-300 font-medium uppercase tracking-wide">
              Payroll
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto sidebar-scroll" aria-label="Sidebar">
        <ul className="space-y-0.5" role="list">
          {visibleItems.map((item) => {
            const isActive = currentView === item.id || (currentView === 'employee-detail' && item.id === 'people');
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
                      'w-4 h-4 shrink-0',
                      isActive ? 'text-teal-400' : 'text-teal-300/70',
                    )}
                  />
                  {item.label}
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="px-3 pb-5 pt-3 border-t border-[#0E6E53]/60">
        <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
          <Avatar
            name={user?.displayName ?? 'User'}
            size="sm"
            status={role === 'EMPLOYEE' ? 'active' : 'active'}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{user?.displayName ?? 'Admin'}</p>
            <p className="text-[10px] text-teal-300 truncate capitalize">{role?.toLowerCase().replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-teal-200 hover:bg-white/10 hover:text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
};
