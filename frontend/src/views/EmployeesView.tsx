import React, { useState } from 'react';
import { Search, Plus, Filter, ChevronRight, UserPlus, Users } from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import type { Employee } from '../types/payroll.types';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple'> = {
  ACTIVE:     'success',
  active:     'success',
  ON_NOTICE:  'warning',
  on_notice:  'warning',
  RESIGNED:   'danger',
  resigned:   'danger',
  PROBATION:  'info',
  probation:  'info',
  INACTIVE:   'neutral',
  inactive:   'neutral',
  TERMINATED: 'danger',
  terminated: 'danger',
  SUSPENDED:  'warning',
  suspended:  'warning',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE:     'Active',
  active:     'Active',
  ON_NOTICE:  'On Notice',
  on_notice:  'On Notice',
  RESIGNED:   'Resigned',
  resigned:   'Resigned',
  PROBATION:  'Probation',
  probation:  'Probation',
  INACTIVE:   'Inactive',
  inactive:   'Inactive',
  TERMINATED: 'Terminated',
  terminated: 'Terminated',
  SUSPENDED:  'Suspended',
  suspended:  'Suspended',
};

const DEPARTMENTS = ['All', 'Engineering', 'Sales', 'HR', 'Operations'];

export const EmployeesView: React.FC = () => {
  const { employees, setCurrentView, setSelectedEmployeeId, isLoading } = usePayroll();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('All');

  const filtered = employees.filter((e) => {
    const matchSearch =
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase());
    const matchDept = dept === 'All' || e.department === dept;
    return matchSearch && matchDept;
  });

  const handleRowClick = (emp: Employee) => {
    setSelectedEmployeeId(emp.id);
    setCurrentView('employee-detail');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">People</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{filtered.length} of {employees.length} employees</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setCurrentView('add-employee')}
          className="gap-2 self-start sm:self-auto shadow-sm"
        >
          <UserPlus className="w-4 h-4" /> Add Employee
        </Button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name, code or designation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
            aria-label="Search employees"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
            aria-label="Filter by department"
          >
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Employee list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-teal-100 border-t-teal-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16">
          <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No employees found</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            {employees.length === 0
              ? 'Get started by creating your first employee profile.'
              : 'Try adjusting your search or filter'}
          </p>
          {employees.length === 0 && (
            <Button
              variant="primary"
              onClick={() => setCurrentView('add-employee')}
              className="gap-2 mx-auto"
            >
              <UserPlus className="w-4 h-4" /> Add Employee
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((emp) => {
            const statusKey = String(emp.status || 'ACTIVE').toUpperCase();
            const badgeVariant = STATUS_VARIANT[emp.status] || STATUS_VARIANT[statusKey] || 'neutral';
            const badgeLabel = STATUS_LABEL[emp.status] || STATUS_LABEL[statusKey] || (emp.status || 'Active');
            const avatarStatus =
              statusKey === 'ACTIVE'
                ? 'active'
                : statusKey === 'ON_NOTICE'
                ? 'notice'
                : statusKey === 'RESIGNED' || statusKey === 'TERMINATED'
                ? 'resigned'
                : 'none';

            return (
              <Card
                key={emp.id}
                padded={false}
                onClick={() => handleRowClick(emp)}
                className="p-4 flex items-center gap-3 hover:border-teal-200 dark:hover:border-teal-500/40 transition-colors cursor-pointer"
              >
                <Avatar
                  name={emp.name || emp.code}
                  size="lg"
                  status={avatarStatus}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{emp.name || emp.code}</p>
                    <Badge variant={badgeVariant} size="sm">{badgeLabel}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{emp.designation}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="neutral" size="sm">{emp.department}</Badge>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{emp.code}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};


