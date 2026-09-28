import React, { useEffect, useState } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, UserPlus, Users, RefreshCw } from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { employeesApi } from '../api/employees.api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import type { Employee } from '../types/payroll.types';
import { mapBackendEmployeeToUi } from '../utils/employee-mapper.util';

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

const PAGE_SIZES = [12, 24, 50] as const;

export const EmployeesView: React.FC = () => {
  const { rememberEmployee, setCurrentView, setSelectedEmployeeId } = usePayroll();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('All');
  const [departments, setDepartments] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(PAGE_SIZES[0]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    employeesApi.getDepartments()
      .then((items) => {
        if (!cancelled) setDepartments(items.map((item) => item.department_name));
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await employeesApi.list(page, pageSize, search.trim(), dept === 'All' ? '' : dept);
        if (cancelled) return;
        setEmployees(result.items.map(mapBackendEmployeeToUi));
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Employees could not be loaded.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, search ? 300 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dept, page, pageSize, reloadKey, search]);

  const handleRowClick = (emp: Employee) => {
    rememberEmployee(emp);
    setSelectedEmployeeId(emp.id);
    setCurrentView('employee-detail');
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">People</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{rangeStart}–{rangeEnd} of {total} employees</p>
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
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
            aria-label="Search employees"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={dept}
            onChange={(e) => { setDept(e.target.value); setPage(1); }}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
            aria-label="Filter by department"
          >
            <option>All</option>
            {departments.map((department) => <option key={department}>{department}</option>)}
          </select>
        </div>
      </div>

      {/* Employee list */}
      {error ? (
        <Card className="text-center py-12">
          <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>
          <Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)} className="mx-auto mt-4 gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-teal-100 border-t-teal-500 rounded-full animate-spin" />
        </div>
      ) : employees.length === 0 ? (
        <Card className="text-center py-16">
          <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No employees found</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            {total === 0 && !search && dept === 'All'
              ? 'Get started by creating your first employee profile.'
              : 'Try adjusting your search or filter'}
          </p>
          {total === 0 && !search && dept === 'All' && (
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
          {employees.map((emp) => {
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

      {!error && !isLoading && total > 0 && (
        <nav className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-[#2B293E] dark:bg-[#181724]" aria-label="Employee pagination">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <label htmlFor="employee-page-size">Rows per page</label>
            <select
              id="employee-page-size"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
                setPage(1);
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-[#2B293E] dark:bg-[#1E1D2D] dark:text-slate-200"
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>Page {page} of {Math.max(totalPages, 1)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => value - 1)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="secondary" disabled={page >= totalPages || isLoading} onClick={() => setPage((value) => value + 1)} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
};
