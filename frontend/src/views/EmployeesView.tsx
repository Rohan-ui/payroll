import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Eye, FileDown, Pencil, RefreshCw, Search, UserPlus, X,
} from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { useAuth } from '../context/AuthContext';
import {
  employeesApi,
  type DirectoryEmployee,
  type EmployeeDirectoryFilters,
  type EmployeeDirectoryQuery,
  type EmployeeDirectorySummary,
  type EmployeeSortField,
} from '../api/employees.api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { OverflowMenu } from '../components/ui/OverflowMenu';
import { mapBackendEmployeeToUi } from '../utils/employee-mapper.util';
import { saveFile } from '../utils/download';
import { requestProfileEdit } from './employee/profile-intent';
import { toast } from '../lib/toast';
import { SearchPicker } from './performance/SearchPicker';
import { fieldClass, labelClass } from './payroll/payroll-format';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

export const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  ON_NOTICE: { label: 'On notice', variant: 'warning' },
  SUSPENDED: { label: 'Suspended', variant: 'warning' },
  RESIGNED: { label: 'Resigned', variant: 'danger' },
  TERMINATED: { label: 'Terminated', variant: 'danger' },
  EXITED: { label: 'Exited', variant: 'neutral' },
  INACTIVE: { label: 'Inactive', variant: 'neutral' },
};

export const statusMeta = (status: string) => {
  const key = status.toUpperCase();
  return STATUS_META[key] ?? { label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' '), variant: 'neutral' as BadgeVariant };
};

const PAGE_SIZES = [20, 50, 100] as const;

const DEFAULT_QUERY: EmployeeDirectoryQuery = { page: 1, limit: 20, sortBy: 'code', sortOrder: 'asc' };
const FILTER_KEYS = ['search', 'departmentId', 'designationId', 'status', 'employmentTypeId', 'branchId', 'managerId', 'joinedFrom', 'joinedTo'] as const;

type ColumnKey = 'code' | 'name' | 'email' | 'phone' | 'department' | 'designation' | 'manager' | 'type' | 'joined' | 'status' | 'location';

const COLUMNS: { key: ColumnKey; label: string; sort?: EmployeeSortField; required?: boolean }[] = [
  { key: 'code', label: 'Employee ID', sort: 'code' },
  { key: 'name', label: 'Employee', sort: 'name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'department', label: 'Department', sort: 'department' },
  { key: 'designation', label: 'Designation', sort: 'designation' },
  { key: 'manager', label: 'Reporting manager' },
  { key: 'type', label: 'Employment type' },
  { key: 'joined', label: 'Joining date', sort: 'joiningDate' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'location', label: 'Work location' },
];

/** Shown until the viewer chooses otherwise; the rest are one click away under Columns. */
const DEFAULT_HIDDEN: ColumnKey[] = ['phone', 'type', 'location'];
const COLUMNS_KEY = 'voogyo.people.hiddenColumns';

/** Per-tab, per-workspace memory of the directory's filters, so Back from an employee returns to the same list. */
interface SavedDirectory { query: EmployeeDirectoryQuery; managerName?: string }
const savedKey = (tenantId: string | undefined) => `voogyo.people.directory.${tenantId ?? 'none'}`;

function readSaved(tenantId: string | undefined): SavedDirectory {
  try {
    const raw = window.sessionStorage.getItem(savedKey(tenantId));
    if (raw) {
      const saved = JSON.parse(raw) as SavedDirectory;
      if (saved?.query?.sortBy) return { query: { ...DEFAULT_QUERY, ...saved.query }, managerName: saved.managerName };
    }
  } catch {
    // Storage unavailable (private mode, blocked): start from the defaults.
  }
  return { query: DEFAULT_QUERY };
}

function readHiddenColumns(): ColumnKey[] {
  try {
    const raw = window.localStorage.getItem(COLUMNS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((key): key is ColumnKey => COLUMNS.some((c) => c.key === key && !c.required));
    }
  } catch {
    // Storage unavailable: use the default columns.
  }
  return DEFAULT_HIDDEN;
}

/** A calendar date from the API (midnight UTC), shown as that same date wherever the viewer is. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

const fullName = (e: DirectoryEmployee) => [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ') || e.employeeCode;
const todayIso = () => new Date().toISOString().slice(0, 10);
const onProbation = (e: DirectoryEmployee) =>
  e.employeeStatus === 'ACTIVE' && !!e.currentEmployment?.probationEndDate && e.currentEmployment.probationEndDate.slice(0, 10) >= todayIso();

export const EmployeesView: React.FC = () => {
  const ids = useId();
  const { rememberEmployee, setCurrentView, setSelectedEmployeeId } = usePayroll();
  const { can, activeTenant } = useAuth();
  const tenantId = activeTenant?.tenantId;

  const [saved, setSaved] = useState<SavedDirectory>(() => readSaved(tenantId));
  const query = saved.query;
  // Search, department and status are always shown; the rest open on demand, and stay open while one is in use.
  const [showMore, setShowMore] = useState<boolean | null>(null);
  const moreActive = [query.designationId, query.employmentTypeId, query.branchId, query.managerId, query.joinedFrom, query.joinedTo].filter(Boolean).length;
  const moreOpen = showMore ?? moreActive > 0;
  const [searchText, setSearchText] = useState(query.search ?? '');
  const [page, setPage] = useState<{ items: DirectoryEmployee[]; total: number; totalPages: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState<EmployeeDirectoryFilters | null>(null);
  const [summary, setSummary] = useState<EmployeeDirectorySummary | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<ColumnKey[]>(readHiddenColumns);
  const [isExporting, setIsExporting] = useState(false);

  const changeQuery = useCallback((change: Partial<EmployeeDirectoryQuery>, managerName?: string | null) => {
    setSaved((current) => {
      const next: SavedDirectory = {
        query: { ...current.query, page: 1, ...change },
        managerName: managerName === null ? undefined : managerName ?? current.managerName,
      };
      try {
        window.sessionStorage.setItem(savedKey(tenantId), JSON.stringify(next));
      } catch {
        // Not remembered across Back; the list still works.
      }
      return next;
    });
  }, [tenantId]);

  // Typing settles for a moment before the server is asked.
  useEffect(() => {
    if (searchText.trim() === (query.search ?? '')) return;
    const timer = window.setTimeout(() => changeQuery({ search: searchText.trim() || undefined }), 300);
    return () => window.clearTimeout(timer);
  }, [searchText, query.search, changeQuery]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    employeesApi.directory(query)
      .then((result) => {
        if (!cancelled) setPage({ items: result.items, total: result.total, totalPages: result.totalPages });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Employees could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [query, reloadKey]);

  // Filter choices and headline counts load once; a failure leaves the list itself usable.
  useEffect(() => {
    let cancelled = false;
    employeesApi.directoryFilters().then((f) => !cancelled && setFilters(f)).catch(() => !cancelled && setFilters(null));
    employeesApi.directorySummary().then((s) => !cancelled && setSummary(s)).catch(() => !cancelled && setSummary(null));
    return () => { cancelled = true; };
  }, [reloadKey]);

  const toggleColumn = (key: ColumnKey) => {
    setHiddenColumns((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      try {
        window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
      } catch {
        // Column choice applies to this visit only.
      }
      return next;
    });
  };
  const columns = COLUMNS.filter((c) => !hiddenColumns.includes(c.key));

  /** Opens the employee's page; Edit opens it on Personal with the edit form ready. */
  const open = (employee: DirectoryEmployee, intent: 'view' | 'edit') => {
    rememberEmployee(mapBackendEmployeeToUi(employee));
    setSelectedEmployeeId(employee.id);
    if (intent === 'edit') requestProfileEdit();
    setCurrentView('employee-detail');
  };

  const sortBy = (field: EmployeeSortField) =>
    changeQuery({ sortBy: field, sortOrder: query.sortBy === field && query.sortOrder === 'asc' ? 'desc' : 'asc' });

  /** What is filtered, each with its own way out. */
  const activeFilters = useMemo(() => {
    const nameOf = <T extends { id: string }>(list: T[] | undefined, id: string | undefined, pick: (item: T) => string) =>
      list?.find((item) => item.id === id) ? pick(list.find((item) => item.id === id) as T) : 'Selected';
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (query.search) chips.push({ key: 'search', label: `Search: “${query.search}”`, clear: () => { setSearchText(''); changeQuery({ search: undefined }); } });
    if (query.departmentId) chips.push({ key: 'dept', label: `Department: ${nameOf(filters?.departments, query.departmentId, (d) => d.department_name)}`, clear: () => changeQuery({ departmentId: undefined }) });
    if (query.designationId) chips.push({ key: 'desig', label: `Designation: ${nameOf(filters?.designations, query.designationId, (d) => d.designation_name)}`, clear: () => changeQuery({ designationId: undefined }) });
    if (query.status) chips.push({ key: 'status', label: `Status: ${statusMeta(query.status).label}`, clear: () => changeQuery({ status: undefined }) });
    if (query.employmentTypeId) chips.push({ key: 'type', label: `Type: ${nameOf(filters?.employmentTypes, query.employmentTypeId, (t) => t.employment_type_name)}`, clear: () => changeQuery({ employmentTypeId: undefined }) });
    if (query.branchId) chips.push({ key: 'branch', label: `Location: ${nameOf(filters?.branches, query.branchId, (b) => b.branch_name)}`, clear: () => changeQuery({ branchId: undefined }) });
    if (query.managerId) chips.push({ key: 'manager', label: `Reports to: ${saved.managerName ?? 'Selected manager'}`, clear: () => changeQuery({ managerId: undefined }, null) });
    if (query.joinedFrom || query.joinedTo) {
      chips.push({
        key: 'joined',
        label: `Joined: ${query.joinedFrom ? formatDay(query.joinedFrom) : 'any time'} – ${query.joinedTo ? formatDay(query.joinedTo) : 'today'}`,
        clear: () => changeQuery({ joinedFrom: undefined, joinedTo: undefined }),
      });
    }
    return chips;
  }, [query, filters, saved.managerName, changeQuery]);

  const clearAll = () => {
    setSearchText('');
    changeQuery(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])), null);
  };

  const total = page?.total ?? 0;

  const exportList = async () => {
    setIsExporting(true);
    try {
      const { page: _page, limit: _limit, ...filtersOnly } = query;
      const file = await employeesApi.exportDirectory(filtersOnly);
      saveFile(file.blob, file.filename);
      toast.success(`Exported ${total} employee${total === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The export could not be created.');
    } finally {
      setIsExporting(false);
    }
  };
  const rangeStart = total === 0 ? 0 : (query.page - 1) * query.limit + 1;
  const rangeEnd = Math.min(query.page * query.limit, total);
  const isFiltered = activeFilters.length > 0;
  const datesInverted = Boolean(query.joinedFrom && query.joinedTo && query.joinedFrom > query.joinedTo);

  const cell = (employee: DirectoryEmployee, key: ColumnKey): React.ReactNode => {
    const job = employee.currentEmployment;
    switch (key) {
      case 'code': return <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{employee.employeeCode}</span>;
      case 'name': return (
        <div className="flex items-center gap-3 min-w-[12rem]">
          <Avatar name={fullName(employee)} size="sm" />
          <button type="button" onClick={() => open(employee, 'view')}
            className="text-left font-semibold text-slate-800 hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded dark:text-slate-100 dark:hover:text-teal-300">
            {fullName(employee)}
          </button>
        </div>
      );
      case 'email': return employee.workEmail ? <span className="block max-w-[14rem] truncate" title={employee.workEmail}>{employee.workEmail}</span> : <Empty />;
      case 'phone': return employee.workMobile || <Empty />;
      case 'department': return job?.department || <Empty />;
      case 'designation': return job?.designation || <Empty />;
      case 'manager': return employee.manager?.name || <Empty />;
      case 'type': return job?.employmentType || <Empty />;
      case 'joined': return <span className="whitespace-nowrap tabular-nums">{formatDay(job?.joiningDate ?? employee.hireDate)}</span>;
      case 'status': {
        const meta = statusMeta(employee.employeeStatus);
        return (
          <div className="flex flex-wrap gap-1">
            <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
            {onProbation(employee) && <Badge variant="info" size="sm">Probation</Badge>}
          </div>
        );
      }
      case 'location': return job?.branch || <Empty />;
    }
  };

  return (
    <div data-dark-safe className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">People</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Everyone employed by this workspace, past and present.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          {can('people.export') && (
            <Button variant="secondary" onClick={exportList} disabled={isExporting || total === 0} className="gap-2" title="Exports the employees matching the current filters">
              <FileDown className="h-4 w-4" aria-hidden="true" /> {isExporting ? 'Exporting…' : 'Export'}
            </Button>
          )}
          {can('people.create') && (
            <Button variant="primary" onClick={() => setCurrentView('add-employee')} className="gap-2">
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Add employee
            </Button>
          )}
        </div>
      </div>

      <SummaryStrip summary={summary} />

      <section aria-label="Search and filters" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-[#2B293E] dark:bg-[#181724]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-search`} className={labelClass}>Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input id={`${ids}-search`} type="search" value={searchText} maxLength={160} onChange={(e) => setSearchText(e.target.value)}
                placeholder="Name, employee ID, email or phone" className={`${fieldClass} pl-9`} />
            </div>
          </div>
          <FilterSelect id={`${ids}-dept`} label="Department" value={query.departmentId} onChange={(v) => changeQuery({ departmentId: v })}
            options={filters?.departments.map((d) => ({ id: d.id, name: d.department_name }))} all="All departments" />
          <FilterSelect id={`${ids}-status`} label="Employment status" value={query.status} onChange={(v) => changeQuery({ status: v })}
            options={filters?.statuses.map((s) => ({ id: s, name: statusMeta(s).label }))} all="All statuses" />
        </div>

        <button type="button" onClick={() => setShowMore(!moreOpen)} aria-expanded={moreOpen} aria-controls={`${ids}-more`}
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300">
          {moreOpen ? 'Fewer filters' : `More filters${moreActive ? ` (${moreActive} in use)` : ''}`}
        </button>
        {moreOpen && (
          <div id={`${ids}-more`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect id={`${ids}-desig`} label="Designation" value={query.designationId} onChange={(v) => changeQuery({ designationId: v })}
            options={filters?.designations.map((d) => ({ id: d.id, name: d.designation_name }))} all="All designations" />
          <FilterSelect id={`${ids}-type`} label="Employment type" value={query.employmentTypeId} onChange={(v) => changeQuery({ employmentTypeId: v })}
            options={filters?.employmentTypes.map((t) => ({ id: t.id, name: t.employment_type_name }))} all="All types" />
          <FilterSelect id={`${ids}-branch`} label="Work location" value={query.branchId} onChange={(v) => changeQuery({ branchId: v })}
            options={filters?.branches.map((b) => ({ id: b.id, name: b.branch_name }))} all="All locations" />
          <div>
            {query.managerId ? (
              <>
                <span className={labelClass}>Reporting manager</span>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[#2B293E]">
                  <span className="truncate text-slate-700 dark:text-slate-200">{saved.managerName ?? 'Selected manager'}</span>
                  <button type="button" onClick={() => changeQuery({ managerId: undefined }, null)} aria-label="Clear reporting manager filter"
                    className="rounded p-0.5 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <SearchPicker label="Reporting manager" noun="employees" find={employeesApi.findActive} onPick={(m) => changeQuery({ managerId: m.id }, m.name)} />
            )}
          </div>
          <div>
            <label htmlFor={`${ids}-from`} className={labelClass}>Joined from</label>
            <input id={`${ids}-from`} type="date" value={query.joinedFrom ?? ''} max={query.joinedTo} onChange={(e) => changeQuery({ joinedFrom: e.target.value || undefined })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={`${ids}-to`} className={labelClass}>Joined to</label>
            <input id={`${ids}-to`} type="date" value={query.joinedTo ?? ''} min={query.joinedFrom} onChange={(e) => changeQuery({ joinedTo: e.target.value || undefined })} className={fieldClass} />
          </div>
          </div>
        )}

        {isFiltered && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-[#2B293E]">
            <span className="text-xs font-semibold text-slate-500">Filtered by</span>
            {activeFilters.map((chip) => (
              <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-teal-800 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200">
                {chip.label}
                <button type="button" onClick={chip.clear} aria-label={`Remove filter ${chip.label}`}
                  className="rounded-full p-0.5 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-teal-900">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            <button type="button" onClick={clearAll} className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline dark:text-slate-300">Clear all</button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300" role="status" aria-live="polite">
          {isLoading && !page ? 'Loading employees…' : `${rangeStart}–${rangeEnd} of ${total} employee${total === 1 ? '' : 's'}${isFiltered ? ' matching these filters' : ''}`}
        </p>
        <details className="relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-[#2B293E] dark:bg-[#181724] dark:text-slate-200">
            <Columns3 className="h-4 w-4" aria-hidden="true" /> Columns
          </summary>
          <fieldset className="absolute right-0 z-30 mt-2 w-56 space-y-1 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-[#2B293E] dark:bg-[#1E1D2D]">
            <legend className="sr-only">Columns to show</legend>
            {COLUMNS.filter((c) => !c.required).map((c) => (
              <label key={c.key} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5">
                <input type="checkbox" checked={!hiddenColumns.includes(c.key)} onChange={() => toggleColumn(c.key)} className="h-4 w-4 accent-teal-600" />
                {c.label}
              </label>
            ))}
          </fieldset>
        </details>
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">The employee list could not be loaded: {error}</p>
          <Button variant="secondary" onClick={() => setReloadKey((n) => n + 1)} className="mx-auto mt-3 gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </Button>
        </div>
      ) : !page ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none dark:bg-[#1E1D2D]" aria-busy="true" aria-label="Loading employees" />
      ) : page.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-[#2B293E]">
          {isFiltered ? (
            <>
              <p className="font-semibold text-slate-800 dark:text-slate-200">No employees match these filters</p>
              <p className="mt-1 text-sm text-slate-500">{datesInverted ? '“Joined from” is after “Joined to”. Swap the dates.' : 'Change or clear the filters to see more people.'}</p>
              <Button variant="secondary" onClick={clearAll} className="mx-auto mt-4">Clear all filters</Button>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-800 dark:text-slate-200">No employees yet</p>
              <p className="mt-1 text-sm text-slate-500">Add employees here, or convert onboarding candidates when they join. Payroll, attendance and leave all start from these records.</p>
              {can('people.create') && (
                <Button variant="primary" onClick={() => setCurrentView('add-employee')} className="mx-auto mt-4 gap-2">
                  <UserPlus className="h-4 w-4" aria-hidden="true" /> Add employee
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={`max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-[#2B293E] dark:bg-[#181724] ${isLoading ? 'opacity-60' : ''}`} aria-busy={isLoading}>
          <table className="w-full min-w-[960px] text-left text-sm">
            <caption className="sr-only">Employees, sorted by {COLUMNS.find((c) => c.sort === query.sortBy)?.label} {query.sortOrder === 'asc' ? 'ascending' : 'descending'}</caption>
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-[#1E1D2D] dark:text-slate-400">
              <tr>
                {columns.map((c) => {
                  const active = c.sort === query.sortBy;
                  const Icon = !active ? ChevronsUpDown : query.sortOrder === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th key={c.key} scope="col" aria-sort={c.sort ? (active ? (query.sortOrder === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                      className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-bold dark:border-[#2B293E]">
                      {c.sort ? (
                        <button type="button" onClick={() => sortBy(c.sort as EmployeeSortField)}
                          className="inline-flex items-center gap-1 rounded uppercase hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:text-white">
                          {c.label}
                          <Icon className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ) : c.label}
                    </th>
                  );
                })}
                <th scope="col" className="border-b border-slate-200 px-3 py-3 text-right font-bold dark:border-[#2B293E]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-[#2B293E] dark:text-slate-300">
              {page.items.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                  {columns.map((c) => <td key={c.key} className="px-3 py-2.5 align-middle">{cell(employee, c.key)}</td>)}
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex justify-end">
                      <OverflowMenu label={`Actions for ${fullName(employee)}`} items={[
                        { label: 'View details', icon: Eye, onSelect: () => open(employee, 'view') },
                        ...(can('people.update') ? [{ label: 'Edit details', icon: Pencil, onSelect: () => open(employee, 'edit') }] : []),
                      ]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && page && total > 0 && (
        <nav className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-[#2B293E] dark:bg-[#181724]" aria-label="Employee pagination">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <label htmlFor="employee-page-size">Rows per page</label>
            <select id="employee-page-size" value={query.limit} onChange={(e) => changeQuery({ limit: Number(e.target.value) })}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-[#2B293E] dark:bg-[#1E1D2D] dark:text-slate-200">
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <span>Page {query.page} of {Math.max(page.totalPages, 1)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={query.page <= 1 || isLoading} onClick={() => changeQuery({ page: query.page - 1 })} className="gap-1">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
            </Button>
            <Button variant="secondary" disabled={query.page >= page.totalPages || isLoading} onClick={() => changeQuery({ page: query.page + 1 })} className="gap-1">
              Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
};

const Empty: React.FC = () => <span className="text-slate-400" aria-label="Not recorded">—</span>;

const FilterSelect: React.FC<{
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: { id: string; name: string }[] | undefined;
  all: string;
}> = ({ id, label, value, onChange, options, all }) => (
  <div>
    <label htmlFor={id} className={labelClass}>{label}</label>
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className={fieldClass} disabled={!options}>
      <option value="">{options ? all : 'Loading…'}</option>
      {options?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  </div>
);

/** Headline counts from the server; nothing is shown that it did not count. */
const SummaryStrip: React.FC<{ summary: EmployeeDirectorySummary | null }> = ({ summary }) => {
  const tiles = summary
    ? [
        { label: 'Total employees', value: summary.total, hint: 'Every record, including those who have left' },
        { label: 'Active', value: summary.active, hint: summary.onNotice ? `Includes ${summary.onNotice} on notice` : 'Currently employed' },
        { label: 'Inactive', value: summary.inactive, hint: 'Exited, resigned or otherwise not active' },
        { label: 'On probation', value: summary.onProbation, hint: 'Probation end date still ahead' },
        { label: 'Recently joined', value: summary.recentlyJoined, hint: `Joined in the last ${summary.recentJoinerDays} days` },
      ]
    : null;
  if (!tiles) return null;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5 dark:border-[#2B293E] dark:bg-[#2B293E]">
      {tiles.map((t) => (
        <div key={t.label} className="bg-white px-4 py-3 dark:bg-[#181724]">
          <dt className="text-xs text-slate-500 dark:text-slate-400">{t.label}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{t.value}</dd>
          <dd className="text-xs text-slate-500 dark:text-slate-400">{t.hint}</dd>
        </div>
      ))}
    </dl>
  );
};
