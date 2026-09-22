import React from 'react';
import { LayoutDashboard, Users, Banknote, FileText, MoreHorizontal, Target, Mail } from 'lucide-react';
import { usePayroll } from '../../context/PayrollContext';
import type { AppView } from '../../types/payroll.types';
import { cn } from '../../utils/cn';

interface TabItem {
  id: AppView;
  label: string;
  icon: React.ElementType;
}

const TABS: TabItem[] = [
  { id: 'dashboard', label: 'Home',     icon: LayoutDashboard },
  { id: 'crm',       label: 'CRM',      icon: Target },
  { id: 'emails',    label: 'Emails',   icon: Mail },
  { id: 'payroll',   label: 'Payroll',  icon: Banknote },
  { id: 'people',    label: 'People',   icon: Users },
];

export const MobileNav: React.FC = () => {
  const { currentView, setCurrentView } = usePayroll();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-[#181724] border-t border-slate-200 dark:border-[#2B293E] shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
      aria-label="Bottom navigation"
    >
      <ul className="flex" role="list">
        {TABS.map((tab) => {
          const isActive = currentView === tab.id || (tab.id === 'people' && currentView === 'employee-detail');
          return (
            <li key={tab.id} className="flex-1">
              <button
                onClick={() => setCurrentView(tab.id)}
                className={cn(
                  'w-full flex flex-col items-center justify-center gap-0.5 pt-2 pb-3 min-h-touch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500',
                  isActive ? 'text-teal-600' : 'text-slate-400',
                )}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
              >
                <tab.icon
                  className={cn('w-5 h-5', isActive ? 'stroke-[2.5px]' : 'stroke-2')}
                />
                <span className={cn('text-[10px] font-semibold', isActive ? 'text-teal-600' : 'text-slate-400')}>
                  {tab.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 w-6 h-0.5 rounded-full bg-teal-500" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
