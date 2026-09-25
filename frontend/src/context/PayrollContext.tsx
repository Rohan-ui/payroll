import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Employee,
  PayrollRun,
  UserRole,
  EmployeeAttendance,
  EmployeePayrollItem,
  AnomalyItem,
  AppView,
  CrmTab,
} from '../types/payroll.types';
import { useAuth } from './AuthContext';
import { employeesApi } from '../api/employees.api';
import { mapBackendEmployeeToUi } from '../utils/employee-mapper.util';
import { calculateEmployeePayroll } from '../utils/payroll-calc.util';
import { attendanceApi } from '../api/attendance.api';

const VALID_CRM_TABS: CrmTab[] = [
  'cold-funnel',
  'pipeline',
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
  'payslips',
  'bookkeeping',
  'reports',
  'settings',
  'organization',
  'users',
  'help',
];

const parseUrlState = (): { view: AppView; crmTab: CrmTab } => {
  try {
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as any;
    const viewParam = params.get('view') as AppView | null;

    let crmTab: CrmTab = 'cold-funnel';
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

    return { view: 'dashboard', crmTab: 'cold-funnel' };
  } catch {
    return { view: 'dashboard', crmTab: 'cold-funnel' };
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
  addEmployee: (emp: Partial<Employee>) => Promise<void>;
  updateEmployee: (id: string, emp: Partial<Employee> & { bankAccountNumber?: string }) => Promise<void>;
  currentPeriod: string;
  payrollRun: PayrollRun;
  attendanceMap: Record<string, EmployeeAttendance>;
  updateAttendance: (empId: string, lopDays: number) => void;
  markAllPresent: () => void;
  calculateCurrentPayroll: () => Promise<void>;
  approveCurrentPayroll: () => Promise<void>;
  finalizeCurrentPayroll: () => Promise<void>;
  wizardStep: number;
  setWizardStep: (step: number) => void;
  currentView: AppView;
  setCurrentView: (view: AppView, tab?: CrmTab) => void;
  crmTab: CrmTab;
  setCrmTab: (tab: CrmTab) => void;
  navigateTo: (view: AppView, tab?: CrmTab) => void;
  selectedPayslipEmployee: EmployeePayrollItem | null;
  setSelectedPayslipEmployee: (emp: EmployeePayrollItem | null) => void;
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
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [selectedPayslipEmployee, setSelectedPayslipEmployee] = useState<EmployeePayrollItem | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, EmployeeAttendance>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [payrollRun, setPayrollRun] = useState<PayrollRun>({
    id: 'run-oct-2026',
    periodMonth: 'October 2026',
    periodCode: '2026-10',
    status: 'DRAFT',
    totalEmployees: 0,
    totalGross: 0,
    totalDeductions: 0,
    totalNetPayout: 0,
    totalEmployerContributions: 0,
    items: [],
    anomalies: [],
  });

  useEffect(() => {
    if (activeRole) {
      setRole(activeRole as UserRole);
    }
  }, [activeRole]);

  // Compute payroll items from current employees and attendance
  const computeRunFromState = useCallback(
    (empList: Employee[], attMap: Record<string, EmployeeAttendance>, status: PayrollRun['status'] = 'DRAFT'): PayrollRun => {
      const totalMonthDays = 31;
      const items: EmployeePayrollItem[] = [];
      const anomalies: AnomalyItem[] = [];

      empList.forEach((emp) => {
        const att = attMap[emp.id] || {
          employeeId: emp.id,
          monthDays: totalMonthDays,
          presentDays: 27,
          paidLeaveDays: 4,
          lossOfPayDays: 0,
          payableDays: totalMonthDays,
        };

        const item = calculateEmployeePayroll(emp, att, undefined, { totalMonthDays });
        items.push(item);

        if (emp.isNewJoiner) {
          anomalies.push({
            id: `anom-${emp.id}`,
            type: 'NEW_JOINER',
            severity: 'info',
            employeeId: emp.id,
            employeeName: emp.name,
            message: `Joined in October. Salary pro-rated for ${att.payableDays} payable days.`,
            suggestedAction: 'Verify joining date and pro-rata attendance.',
          });
        }

        if (!emp.bank?.isValidIfsc || emp.bank?.accountNumberMasked === 'Missing') {
          anomalies.push({
            id: `anom-bank-${emp.id}`,
            type: 'MISSING_BANK',
            severity: 'critical',
            employeeId: emp.id,
            employeeName: emp.name,
            message: `Bank account details or IFSC missing. Cannot generate NEFT advice.`,
            suggestedAction: 'Add valid IFSC & account number before bank file export.',
          });
        }

        if (att.lossOfPayDays >= 3) {
          anomalies.push({
            id: `anom-lop-${emp.id}`,
            type: 'HIGH_LOP',
            severity: 'warning',
            employeeId: emp.id,
            employeeName: emp.name,
            message: `${att.lossOfPayDays} days of Loss of Pay (LOP) deducted from salary.`,
            suggestedAction: 'Verify leave approval records.',
          });
        }
      });

      const totalGross = items.reduce((sum, i) => sum + i.grossEarnings, 0);
      const totalDeductions = items.reduce((sum, i) => sum + i.totalDeductions, 0);
      const totalNetPayout = items.reduce((sum, i) => sum + i.netPay, 0);
      const totalEmployerContributions = items.reduce(
        (sum, i) => sum + i.epfEmployer + i.epsEmployer + i.esicEmployer,
        0,
      );

      return {
        id: 'run-oct-2026',
        periodMonth: 'October 2026',
        periodCode: '2026-10',
        status,
        totalEmployees: items.length,
        totalGross,
        totalDeductions,
        totalNetPayout,
        totalEmployerContributions,
        items,
        anomalies,
      };
    },
    [],
  );

  // Load real data from backend API
  const refreshData = useCallback(async () => {
    if (!activeTenant) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch real employees from PostgreSQL
      let mappedEmployees: Employee[] = [];
      try {
        const empRes = await employeesApi.list(1, 100);
        mappedEmployees = (empRes.items || []).map(mapBackendEmployeeToUi);
      } catch (err) {
        console.warn('Could not fetch employees from backend:', err);
        mappedEmployees = [];
      }
      setEmployees(mappedEmployees);

      // 2. Fetch real attendance summary from backend API
      const newAttMap: Record<string, EmployeeAttendance> = {};
      const now = new Date();
      const liveMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const daysInLiveMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      let totalMonthDays = daysInLiveMonth;

      try {
        let attSummary = await attendanceApi.getSummary(liveMonth);
        if (!attSummary?.summaries?.length) {
          attSummary = await attendanceApi.getSummary('2026-10');
        }
        totalMonthDays = attSummary.totalMonthDays || daysInLiveMonth;
        const summaryLookup = new Map<string, any>();
        attSummary.summaries.forEach((s) => {
          summaryLookup.set(s.employeeId, s);
        });

        mappedEmployees.forEach((emp) => {
          const s = summaryLookup.get(emp.id);
          if (s) {
            newAttMap[emp.id] = {
              employeeId: emp.id,
              monthDays: s.monthDays,
              presentDays: s.presentDays,
              paidLeaveDays: s.paidLeaveDays,
              lossOfPayDays: s.lossOfPayDays,
              payableDays: s.payableDays,
            };
          } else {
            newAttMap[emp.id] = {
              employeeId: emp.id,
              monthDays: totalMonthDays,
              presentDays: totalMonthDays,
              paidLeaveDays: 0,
              lossOfPayDays: 0,
              payableDays: totalMonthDays,
            };
          }
        });
      } catch (e) {
        console.warn('Could not load attendance summary from backend:', e);
        mappedEmployees.forEach((emp) => {
          newAttMap[emp.id] = {
            employeeId: emp.id,
            monthDays: totalMonthDays,
            presentDays: 27,
            paidLeaveDays: 4,
            lossOfPayDays: 0,
            payableDays: totalMonthDays,
          };
        });
      }
      setAttendanceMap(newAttMap);

      // 3. Compute initial payroll run
      const run = computeRunFromState(mappedEmployees, newAttMap, 'DRAFT');
      setPayrollRun(run);
      if (run.items.length > 0) {
        setSelectedPayslipEmployee(run.items[0]);
      }
    } catch (err: any) {
      console.error('Failed to load data from backend:', err);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeTenant, computeRunFromState]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const updateAttendance = (empId: string, lopDays: number) => {
    setAttendanceMap((prev) => {
      const current = prev[empId];
      if (!current) return prev;
      const total = current.monthDays;
      const payableDays = Math.max(0, total - lopDays);
      const nextMap = {
        ...prev,
        [empId]: {
          ...current,
          lossOfPayDays: lopDays,
          payableDays,
        },
      };
      setPayrollRun(computeRunFromState(employees, nextMap, 'DRAFT'));
      return nextMap;
    });
  };

  const markAllPresent = async () => {
    try {
      await attendanceApi.bulkMark({ month: '2026-10', defaultStatus: 'PRESENT' });
      await refreshData();
    } catch (err) {
      console.error('Failed to bulk mark all present:', err);
      setAttendanceMap((prev) => {
        const next: Record<string, EmployeeAttendance> = {};
        Object.keys(prev).forEach((k) => {
          next[k] = {
            ...prev[k],
            lossOfPayDays: 0,
            payableDays: prev[k].monthDays,
          };
        });
        setPayrollRun(computeRunFromState(employees, next, 'CALCULATED'));
        return next;
      });
    }
  };

  const calculateCurrentPayroll = async () => {
    setIsLoading(true);
    try {
      // Re-run deterministic decimal payroll math
      const run = computeRunFromState(employees, attendanceMap, 'CALCULATED');
      setPayrollRun({
        ...run,
        calculatedAt: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const approveCurrentPayroll = async () => {
    setIsLoading(true);
    try {
      setPayrollRun((prev) => ({
        ...prev,
        status: 'APPROVED',
        approvedAt: new Date().toISOString(),
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const finalizeCurrentPayroll = async () => {
    setIsLoading(true);
    try {
      setPayrollRun((prev) => ({
        ...prev,
        status: 'PAID',
        paidAt: new Date().toISOString(),
      }));
    } finally {
      setIsLoading(false);
    }
  };

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
        rawAccount && ifsc
          ? {
              bankName: empData.bank?.bankName || 'Unknown Bank',
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
        workEmail: empData.workEmail || `${firstName.toLowerCase()}@acme.com`,
        workMobile: empData.mobileNumber || '+91 98765 43210',
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
              bankName: empData.bank?.bankName || 'HDFC Bank',
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
          const updatedGross = empData.salary?.grossMonthly ?? e.salary.grossMonthly;
          const basicMonthly = Math.round(updatedGross * 0.5);
          const hraMonthly = Math.round(basicMonthly * 0.4);
          const specialAllowanceMonthly = updatedGross - basicMonthly - hraMonthly;

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
            bank: {
              ...e.bank,
              ...(empData.bank || {}),
              accountNumberMasked: rawAccount
                ? `••••${rawAccount.slice(-4)}`
                : e.bank.accountNumberMasked,
              bankName: empData.bank?.bankName || e.bank.bankName,
              ifsc: empData.bank?.ifsc || e.bank.ifsc,
              isValidIfsc: !!(empData.bank?.ifsc && empData.bank.ifsc.length === 11),
            },
            salary: {
              ...e.salary,
              ...(empData.salary || {}),
              grossMonthly: updatedGross,
              basicMonthly,
              hraMonthly,
              specialAllowanceMonthly,
              ctcAnnual: updatedGross * 12,
            },
            statutory: {
              ...e.statutory,
              ...(empData.statutory || {}),
            },
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

  return (
    <PayrollContext.Provider
      value={{
        role,
        setRole,
        employees,
        addEmployee,
        updateEmployee,
        currentPeriod: 'October 2026',
        payrollRun,
        attendanceMap,
        updateAttendance,
        markAllPresent,
        calculateCurrentPayroll,
        approveCurrentPayroll,
        finalizeCurrentPayroll,
        wizardStep,
        setWizardStep,
        currentView,
        setCurrentView,
        crmTab,
        setCrmTab,
        navigateTo,
        selectedPayslipEmployee,
        setSelectedPayslipEmployee,
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
