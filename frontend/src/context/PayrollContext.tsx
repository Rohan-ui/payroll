import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Employee,
  UserRole,
  AppView,
  CrmTab,
} from '../types/payroll.types';
import { useAuth } from './AuthContext';
import { employeesApi } from '../api/employees.api';
import { mapBackendEmployeeToUi } from '../utils/employee-mapper.util';

const VALID_CRM_TABS: CrmTab[] = [
  'cold-funnel',
  'pipeline',
  'leads',
  'activities',
  'proposals',
  'reports',
  'masters',
  'audit-trail',
];

const VALID_VIEWS: AppView[] = [
  'dashboard',
  'crm',
  'emails',
  'payroll',
  'people',
  'employee-detail',
  'add-employee',
  'edit-employee',
  'attendance',
  'clock-in',
  'onboarding',
  'performance',
  'payslips',
  'bookkeeping',
  'reports',
  'settings',
  'organization',
  'users',
  'my-email',
  'help',
];

/** The CRM opens on Sales Pipelines unless a deep link (?tab=…) names another tab. */
const DEFAULT_CRM_TAB: CrmTab = 'pipeline';

const parseUrlState = (): { view: AppView; crmTab: CrmTab } => {
  try {
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as any;
    const viewParam = params.get('view') as AppView | null;

    let crmTab: CrmTab = DEFAULT_CRM_TAB;
    if (tabParam && VALID_CRM_TABS.includes(tabParam)) {
      crmTab = tabParam;
    }

    // 1. If path is 'emails'
    if (rawPath === 'emails') {
      return { view: 'emails', crmTab };
    }

    // 2. If path is 'crm'
    if (rawPath === 'crm') {
      return { view: 'crm', crmTab };
    }

    // 3. If tabParam is an organization tab
    if (['organization', 'roles', 'modules', 'integrations', 'industries'].includes(tabParam)) {
      return { view: 'organization', crmTab };
    }

    // 4. If tabParam is a valid CRM tab (e.g. /?tab=masters)
    if (tabParam && VALID_CRM_TABS.includes(tabParam)) {
      return { view: 'crm', crmTab };
    }

    // 5. If path matches a known view
    if (rawPath && VALID_VIEWS.includes(rawPath as AppView)) {
      return { view: rawPath as AppView, crmTab };
    }

    // 6. If query param view matches
    if (viewParam && VALID_VIEWS.includes(viewParam)) {
      return { view: viewParam, crmTab };
    }

    return { view: 'dashboard', crmTab: DEFAULT_CRM_TAB };
  } catch {
    return { view: 'dashboard', crmTab: DEFAULT_CRM_TAB };
  }
};

const syncUrlWithState = (view: AppView, tab?: CrmTab, replace: boolean = false) => {
  try {
    let targetPath = '';
    const params = new URLSearchParams(window.location.search);

    if (view === 'crm') {
      targetPath = '/crm';
      if (tab) {
        params.set('tab', tab);
      }
    } else if (view === 'emails') {
      targetPath = '/emails';
      params.delete('tab');
    } else if (view === 'dashboard') {
      targetPath = '/';
      params.delete('tab');
      params.delete('view');
    } else {
      targetPath = `/${view}`;
      params.delete('tab');
    }

    const queryStr = params.toString();
    const fullUrl = queryStr ? `${targetPath}?${queryStr}` : targetPath || '/';

    if (window.location.pathname + window.location.search !== fullUrl) {
      if (replace) {
        window.history.replaceState(null, '', fullUrl);
      } else {
        window.history.pushState(null, '', fullUrl);
      }
    }
  } catch {
    // ignore
  }
};

interface PayrollContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  employees: Employee[];
  rememberEmployee: (employee: Employee) => void;
  addEmployee: (emp: Partial<Employee>) => Promise<void>;
  updateEmployee: (id: string, emp: Partial<Employee> & { bankAccountNumber?: string }) => Promise<void>;
  currentView: AppView;
  setCurrentView: (view: AppView, tab?: CrmTab) => void;
  crmTab: CrmTab;
  setCrmTab: (tab: CrmTab) => void;
  navigateTo: (view: AppView, tab?: CrmTab) => void;
  selectedEmployeeId: string | null;
  setSelectedEmployeeId: (id: string | null) => void;
  isLoading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
}

const PayrollContext = createContext<PayrollContextType | undefined>(undefined);

export const PayrollProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeTenant, activeRole } = useAuth();

  // Display label only; what a member may do comes from access.permissions.
  const [role, setRole] = useState<UserRole>((activeRole as UserRole) || 'EMPLOYEE');
  
  const initialUrlState = parseUrlState();
  const [currentView, setCurrentViewInternal] = useState<AppView>(initialUrlState.view);
  const [crmTab, setCrmTabInternal] = useState<CrmTab>(initialUrlState.crmTab);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeRole) {
      setRole(activeRole as UserRole);
    }
  }, [activeRole]);

  // Load real data from backend API
  const refreshData = useCallback(async () => {
    if (!activeTenant) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch real employees from PostgreSQL
      let mappedEmployees: Employee[] = [];
      try {
        const firstPage = await employeesApi.list(1, 50);
        const pages = [firstPage];
        // ponytail: the shared payroll prototype needs all employees; move calculations server-side before very large tenants.
        for (let page = 2; page <= firstPage.totalPages; page += 1) {
          pages.push(await employeesApi.list(page, 50));
        }
        mappedEmployees = pages.flatMap((response) => response.items).map(mapBackendEmployeeToUi);
      } catch (err) {
        console.warn('Could not fetch employees from backend:', err);
        mappedEmployees = [];
      }
      setEmployees(mappedEmployees);

    } catch (err: any) {
      console.error('Failed to load data from backend:', err);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const addEmployee = async (empData: Partial<Employee> & { bankAccountNumber?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const names = (empData.name || 'New Staff').trim().split(' ');
      const firstName = names[0] || 'Staff';
      const lastName = names.slice(1).join(' ') || '';

      const rawAccount =
        empData.bankAccountNumber ||
        empData.bank?.accountNumber ||
        empData.bank?.accountNumberMasked?.replace(/[^0-9]/g, '') ||
        '';
      const ifsc = empData.bank?.ifsc || '';

      const bankDetails =
        rawAccount && ifsc && empData.bank?.bankName
          ? {
              bankName: empData.bank?.bankName || '',
              branchName: empData.bank?.branchName,
              accountNumber: rawAccount,
              ifsc: ifsc.toUpperCase(),
              accountHolderName: empData.bank?.accountHolder || empData.name || `${firstName} ${lastName}`.trim(),
            }
          : undefined;

      await employeesApi.create({
        employeeCode: empData.code || `EMP${Date.now().toString().slice(-4)}`,
        firstName,
        lastName,
        workEmail: empData.workEmail || undefined,
        workMobile: empData.mobileNumber || undefined,
        joiningDate: empData.joiningDate || new Date().toISOString().split('T')[0],
        departmentName: empData.department,
        designationName: empData.designation,
        bankDetails,
      });

      await refreshData();
    } catch (err: any) {
      setError(err.message || 'Failed to create employee in database');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateEmployee = async (id: string, empData: Partial<Employee> & { bankAccountNumber?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const names = empData.name ? empData.name.trim().split(' ') : undefined;
      const firstName = names ? names[0] : undefined;
      const lastName = names ? names.slice(1).join(' ') : undefined;

      const rawAccount =
        empData.bankAccountNumber ||
        empData.bank?.accountNumber ||
        empData.bank?.accountNumberMasked?.replace(/[^0-9]/g, '') ||
        '';
      const ifsc = empData.bank?.ifsc || '';

      const bankDetails =
        ifsc || rawAccount
          ? {
              bankName: empData.bank?.bankName || '',
              branchName: empData.bank?.branchName,
              accountNumber: rawAccount || undefined,
              ifsc: ifsc.toUpperCase(),
              accountHolderName: empData.bank?.accountHolder || empData.name,
            }
          : undefined;

      await employeesApi.update(id, {
        firstName,
        lastName,
        workEmail: empData.workEmail,
        workMobile: empData.mobileNumber,
        employeeStatus: empData.status,
        joiningDate: empData.joiningDate,
        departmentName: empData.department,
        designationName: empData.designation,
        bankDetails,
      });

      // Optimistically update local state so UI updates immediately
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          return {
            ...e,
            ...empData,
            name: empData.name || e.name,
            department: empData.department || e.department,
            designation: empData.designation || e.designation,
            workEmail: empData.workEmail || e.workEmail,
            mobileNumber: empData.mobileNumber || e.mobileNumber,
            status: empData.status || e.status,
            joiningDate: empData.joiningDate || e.joiningDate,
            bank: e.bank || empData.bank
              ? {
                  ...(e.bank as NonNullable<Employee['bank']>),
                  ...(empData.bank || {}),
                  accountNumberMasked: rawAccount ? `••••${rawAccount.slice(-4)}` : e.bank?.accountNumberMasked ?? 'Not recorded',
                }
              : undefined,
          };
        }),
      );

      await refreshData();
    } catch (err: any) {
      setError(err.message || 'Failed to update employee in database');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Listen for browser navigation (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseUrlState();
      setCurrentViewInternal(parsed.view);
      setCrmTabInternal(parsed.crmTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setCurrentView = useCallback((view: AppView, newTab?: CrmTab) => {
    setCurrentViewInternal(view);
    const targetTab = newTab || (view === 'crm' ? crmTab : undefined);
    if (targetTab) {
      setCrmTabInternal(targetTab);
    }
    syncUrlWithState(view, targetTab);
  }, [crmTab]);

  const setCrmTab = useCallback((tab: CrmTab) => {
    setCrmTabInternal(tab);
    setCurrentViewInternal('crm');
    syncUrlWithState('crm', tab);
  }, []);

  const navigateTo = useCallback((view: AppView, tab?: CrmTab) => {
    setCurrentView(view, tab);
  }, [setCurrentView]);

  const rememberEmployee = useCallback((employee: Employee) => {
    setEmployees((current) => [employee, ...current.filter((item) => item.id !== employee.id)]);
  }, []);

  return (
    <PayrollContext.Provider
      value={{
        role,
        setRole,
        employees,
        rememberEmployee,
        addEmployee,
        updateEmployee,
        currentView,
        setCurrentView,
        crmTab,
        setCrmTab,
        navigateTo,
        selectedEmployeeId,
        setSelectedEmployeeId,
        isLoading,
        error,
        refreshData,
      }}
    >
      {children}
    </PayrollContext.Provider>
  );
};

export const usePayroll = (): PayrollContextType => {
  const context = useContext(PayrollContext);
  if (!context) {
    throw new Error('usePayroll must be used within a PayrollProvider');
  }
  return context;
};
