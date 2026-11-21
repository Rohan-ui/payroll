import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  ArrowLeft,
  UserPlus,
  Building2,
  Briefcase,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Search,
  Plus,
  Eye,
  EyeOff,
} from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { fieldClass, labelClass } from './payroll/payroll-format';
import { employeesApi } from '../api/employees.api';

interface IfscInfo {
  valid: boolean;
  bank?: string;
  branch?: string;
  address?: string;
  city?: string;
  state?: string;
  ifsc?: string;
  message?: string;
}

export const AddEmployeeView: React.FC = () => {
  const ids = useId();
  const {
    setCurrentView,
    addEmployee,
    refreshData,
    employees,
  } = usePayroll();

  // Basic Information
  const [employeeCode, setEmployeeCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [joiningDate, setJoiningDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Dynamic Department State
  const [departments, setDepartments] = useState<string[]>([
    'Engineering',
    'Operations',
    'Human Resources',
    'Accounts',
    'Production',
    'Sales',
    'Marketing',
  ]);
  const [selectedDept, setSelectedDept] = useState<string>('Engineering');
  const [isCustomDept, setIsCustomDept] = useState<boolean>(false);
  const [customDept, setCustomDept] = useState<string>('');

  // Dynamic Designation State
  const [designations, setDesignations] = useState<string[]>([
    'Senior Software Engineer',
    'Software Engineer',
    'Operations Specialist',
    'HR Specialist',
    'Accounts Executive',
    'Team Lead',
    'Product Designer',
  ]);
  const [selectedDesig, setSelectedDesig] = useState<string>('Senior Software Engineer');
  const [isCustomDesig, setIsCustomDesig] = useState<boolean>(false);
  const [customDesig, setCustomDesig] = useState<string>('');

  // Bank Details
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [showConfirmAccountNumber, setShowConfirmAccountNumber] = useState(false);

  // Razorpay IFSC Verification State
  const [isVerifyingIfsc, setIsVerifyingIfsc] = useState(false);
  const [ifscInfo, setIfscInfo] = useState<IfscInfo | null>(null);
  const [ifscError, setIfscError] = useState<string | null>(null);

  // Salary & Statutory Defaults

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Suggest the next employee code.
  useEffect(() => {
    if (!employeeCode) {
      const nextNum = employees.length + 1;
      setEmployeeCode(`RND${String(nextNum).padStart(3, '0')}`);
    }
  }, [employees.length]);

  // Load existing departments and designations from backend
  useEffect(() => {
    async function loadMeta() {
      try {
        const [deptRes, desigRes] = await Promise.all([
          employeesApi.getDepartments().catch(() => []),
          employeesApi.getDesignations().catch(() => []),
        ]);

        if (deptRes && deptRes.length > 0) {
          const names = Array.from(new Set(deptRes.map((d) => d.department_name)));
          setDepartments((prev) => Array.from(new Set([...prev, ...names])));
        }
        if (desigRes && desigRes.length > 0) {
          const names = Array.from(new Set(desigRes.map((d) => d.designation_name)));
          setDesignations((prev) => Array.from(new Set([...prev, ...names])));
        }
      } catch (err) {
        console.warn('Could not load meta departments/designations:', err);
      }
    }
    loadMeta();
  }, []);

  // Razorpay IFSC Verification Function
  const checkIfscWithRazorpay = useCallback(async (codeToVerify: string) => {
    const cleanCode = codeToVerify.trim().toUpperCase();
    if (cleanCode.length !== 11) {
      setIfscInfo(null);
      setIfscError(null);
      return;
    }

    setIsVerifyingIfsc(true);
    setIfscError(null);

    try {
      // 1. First attempt: direct fetch to Razorpay IFSC public API
      let data: any = null;
      try {
        const response = await fetch(`https://ifsc.razorpay.com/${cleanCode}`);
        if (response.ok) {
          data = await response.json();
        }
      } catch {
        // Direct browser fetch failed (e.g. offline/CORS), fallback to backend proxy
      }

      // 2. Second attempt: Backend proxy
      if (!data) {
        const proxyRes = await employeesApi.verifyIfsc(cleanCode);
        if (proxyRes.valid) {
          data = {
            BANK: proxyRes.bank,
            BRANCH: proxyRes.branch,
            ADDRESS: proxyRes.address,
            CITY: proxyRes.city,
            STATE: proxyRes.state,
            IFSC: proxyRes.ifsc,
          };
        }
      }

      if (data && data.BANK) {
        const info: IfscInfo = {
          valid: true,
          bank: data.BANK,
          branch: data.BRANCH,
          address: data.ADDRESS,
          city: data.CITY,
          state: data.STATE,
          ifsc: data.IFSC || cleanCode,
        };
        setIfscInfo(info);
        setBankName(data.BANK);
        setBranchName(data.BRANCH || '');
        setIfscError(null);
      } else {
        setIfscInfo(null);
        setIfscError('Invalid IFSC Code. Bank branch not found by Razorpay.');
      }
    } catch (err) {
      console.error('Failed to verify IFSC with Razorpay:', err);
      setIfscInfo(null);
      setIfscError('Unable to verify IFSC. Please check your internet connection.');
    } finally {
      setIsVerifyingIfsc(false);
    }
  }, []);

  // Trigger IFSC check on 11 characters
  const handleIfscChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().slice(0, 11);
    setIfsc(val);
    if (val.length === 11) {
      checkIfscWithRazorpay(val);
    } else {
      setIfscInfo(null);
      setIfscError(null);
    }
  };

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validations
    if (!fullName.trim()) {
      setErrorMessage('Full name is required.');
      return;
    }
    if (!workEmail.trim()) {
      setErrorMessage('Work email is required.');
      return;
    }
    if (accountNumber && confirmAccountNumber && accountNumber !== confirmAccountNumber) {
      setErrorMessage('Bank account number and confirm account number do not match.');
      return;
    }
    if (ifsc && !ifscInfo?.valid && ifsc.length === 11) {
      setErrorMessage('Please enter a valid IFSC code verified by Razorpay.');
      return;
    }

    const finalDepartment = isCustomDept ? customDept.trim() : selectedDept;
    if (!finalDepartment) {
      setErrorMessage('Please specify a department.');
      return;
    }

    const finalDesignation = isCustomDesig ? customDesig.trim() : selectedDesig;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await addEmployee({
        code: employeeCode.trim().toUpperCase(),
        name: fullName.trim(),
        department: finalDepartment,
        designation: finalDesignation || '',
        workEmail: workEmail.trim().toLowerCase(),
        mobileNumber: mobileNumber.trim(),
        joiningDate: joiningDate || new Date().toISOString().split('T')[0],
        bank: {
          bankName: bankName.trim() || ifscInfo?.bank || '',
          branchName: branchName.trim() || ifscInfo?.branch || '',
          ifsc: ifsc.trim().toUpperCase(),
          accountNumber: accountNumber.trim(),
          accountNumberMasked: accountNumber.trim(),
          accountHolder: fullName.trim(),
          isValidIfsc: !!ifscInfo?.valid,
        },
      });

      setSuccessMessage(`Employee ${fullName} (${employeeCode}) was successfully added!`);
      await refreshData();

      setTimeout(() => {
        setCurrentView('people');
      }, 1200);
    } catch (err: any) {
      console.error('Failed to save employee:', err);
      setErrorMessage(err?.message || 'Failed to save employee. Please verify details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = `${fieldClass} h-11`;

  return (
    <div data-dark-safe className="w-full space-y-6 pb-12">
      <div className="space-y-2">
        <button type="button" onClick={() => setCurrentView('people')}
          className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> People
        </button>
        <PageHeader breadcrumb={['People', 'Add employee']} title="Add employee" description="Their job, bank account and salary. Everything can be changed later from their profile." />
      </div>

      {/* Notifications */}
      {successMessage && (
        <div role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Identity & Employment Information */}
        <Card
          title="Personal and job details"
          subtitle="Their employee ID, contact details and role."
        >
          <div className="space-y-4 pt-1">
            {/* Identity & Contact Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Employee Code */}
              <div>
                <label htmlFor={`${ids}-f1`} className={labelClass}>
                  Employee Code *
                </label>
                <input id={`${ids}-f1`}
                  type="text"
                  required
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                  placeholder="e.g. RND009"
                  className={`${inputClass} font-mono font-medium`}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Unique staff code for punches and payslips
                </p>
              </div>

              {/* Full Name */}
              <div>
                <label htmlFor={`${ids}-f2`} className={labelClass}>
                  Full Name *
                </label>
                <input id={`${ids}-f2`}
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Legal name as shown in official documents
                </p>
              </div>

              {/* Work Email */}
              <div>
                <label htmlFor={`${ids}-f3`} className={labelClass}>
                  Work Email *
                </label>
                <input id={`${ids}-f3`}
                  type="email"
                  required
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  placeholder="e.g. priya@company.in"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Official tenant email for system access
                </p>
              </div>

              {/* Mobile Number */}
              <div>
                <label htmlFor={`${ids}-f4`} className={labelClass}>
                  Mobile Number
                </label>
                <input id={`${ids}-f4`}
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Primary contact number for notifications
                </p>
              </div>
            </div>

            {/* Department, Designation, Joining Date & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1 border-t border-slate-100">
              {/* Dynamic Department */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={`${ids}-dept`} className={labelClass}>
                    Department *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDept(!isCustomDept);
                      if (!isCustomDept) setCustomDept('');
                    }}
                    className="rounded text-xs font-medium text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300"
                  >
                    {isCustomDept ? 'Choose an existing department' : 'Add a new department'}
                  </button>
                </div>

                {isCustomDept ? (
                  <div className="space-y-1">
                    <input id={`${ids}-dept`}
                      type="text"
                      required
                      value={customDept}
                      onChange={(e) => setCustomDept(e.target.value)}
                      placeholder="Type custom department (e.g. Quality Assurance, R&D)"
                      className={`${inputClass} border-teal-300 ring-1 ring-teal-200`}
                    />
                    <p className="text-[10px] text-teal-700">
                      Will be automatically registered in tenant department directory
                    </p>
                  </div>
                ) : (
                  <select id={`${ids}-dept`}
                    value={selectedDept}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomDept(true);
                        setCustomDept('');
                      } else {
                        setSelectedDept(e.target.value);
                      }
                    }}
                    className={inputClass}
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    <option value="__NEW__">+ Enter custom department...</option>
                  </select>
                )}
              </div>

              {/* Dynamic Designation */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={`${ids}-desig`} className={labelClass}>
                    Designation
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDesig(!isCustomDesig);
                      if (!isCustomDesig) setCustomDesig('');
                    }}
                    className="rounded text-xs font-medium text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300"
                  >
                    {isCustomDesig ? 'Choose an existing designation' : 'Add a new designation'}
                  </button>
                </div>

                {isCustomDesig ? (
                  <input id={`${ids}-desig`}
                    type="text"
                    value={customDesig}
                    onChange={(e) => setCustomDesig(e.target.value)}
                    placeholder="Type custom role (e.g. Senior Product Architect)"
                    className={`${inputClass} border-teal-300 ring-1 ring-teal-200`}
                  />
                ) : (
                  <select id={`${ids}-desig`}
                    value={selectedDesig}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomDesig(true);
                        setCustomDesig('');
                      } else {
                        setSelectedDesig(e.target.value);
                      }
                    }}
                    className={inputClass}
                  >
                    {designations.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    <option value="__NEW__">+ Enter custom designation...</option>
                  </select>
                )}
              </div>

              {/* Joining Date */}
              <div>
                <label htmlFor={`${ids}-f5`} className={labelClass}>
                  Joining Date *
                </label>
                <input id={`${ids}-f5`}
                  type="date"
                  required
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Official date of commencement of employment
                </p>
              </div>

            </div>
          </div>
        </Card>

        {/* 2 & 3: Bank Details & Compensation Side-by-Side on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 2. Bank Details with Razorpay IFSC Verification */}
          <Card
            title="Bank account"
            subtitle="Where their salary is paid. The IFSC is checked against the bank directory."
          >
            <div className="space-y-4 pt-1">
              {/* IFSC Code with Live Verification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor={`${ids}-ifsc`} className={labelClass}>
                      IFSC Code *
                    </label>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Checked against the bank directory</span>
                  </div>
                  <div className="relative">
                    <input id={`${ids}-ifsc`}
                      type="text"
                      required
                      maxLength={11}
                      value={ifsc}
                      onChange={handleIfscChange}
                      placeholder="e.g. HDFC0001234"
                      className={`${inputClass} font-mono uppercase tracking-wider pr-20`}
                    />
                    <button
                      type="button"
                      onClick={() => checkIfscWithRazorpay(ifsc)}
                      disabled={ifsc.length !== 11 || isVerifyingIfsc}
                      className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      {isVerifyingIfsc ? 'Checking…' : 'Verify'}
                    </button>
                  </div>

                  {/* Live IFSC Status Banner */}
                  {isVerifyingIfsc && (
                    <p className="text-xs text-teal-700 mt-1.5 flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                      Querying Razorpay Bank API…
                    </p>
                  )}

                  {ifscInfo?.valid && (
                    <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Verified: {ifscInfo.bank}</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 mt-0.5 ml-5.5">
                        {ifscInfo.branch} Branch {ifscInfo.city ? `• ${ifscInfo.city}, ${ifscInfo.state}` : ''}
                      </p>
                    </div>
                  )}

                  {ifscError && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {ifscError}
                    </p>
                  )}
                </div>

                {/* Bank Name (Auto-populated by Razorpay) */}
                <div>
                  <label htmlFor={`${ids}-f6`} className={labelClass}>
                    Bank Name
                  </label>
                  <input id={`${ids}-f6`}
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Auto-filled from IFSC"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Populates automatically when a valid IFSC is entered
                  </p>
                </div>
              </div>

              {/* Account Number & Confirm Account Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor={`${ids}-f7`} className={labelClass}>
                    Account Number *
                  </label>
                  <div className="relative">
                    <input id={`${ids}-f7`}
                      type={showAccountNumber ? 'text' : 'password'}
                      required
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="e.g. 50100123456789"
                      className={`${inputClass} font-mono pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccountNumber(!showAccountNumber)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer p-0.5"
                      title={showAccountNumber ? 'Hide account number' : 'Show account number'}
                      aria-label={showAccountNumber ? 'Hide account number' : 'Show account number'}
                    >
                      {showAccountNumber ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor={`${ids}-f8`} className={labelClass}>
                    Confirm Account Number *
                  </label>
                  <div className="relative">
                    <input id={`${ids}-f8`}
                      type={showConfirmAccountNumber ? 'text' : 'password'}
                      required={!!accountNumber}
                      value={confirmAccountNumber}
                      onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Re-type account number"
                      className={`${inputClass} font-mono pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmAccountNumber(!showConfirmAccountNumber)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer p-0.5"
                      title={showConfirmAccountNumber ? 'Hide account number' : 'Show account number'}
                      aria-label={showConfirmAccountNumber ? 'Hide account number' : 'Show account number'}
                    >
                      {showConfirmAccountNumber ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {confirmAccountNumber && accountNumber !== confirmAccountNumber && (
                    <p className="text-xs text-red-600 mt-1">Numbers do not match</p>
                  )}
                  {confirmAccountNumber && accountNumber === confirmAccountNumber && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Account number matched
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* 3. Salary */}
          <Card title="Salary" subtitle="Kept in Payroll, with its history.">
            <p className="pt-1 text-sm text-slate-600 dark:text-slate-400">
              Salaries aren’t entered here. After saving, open the employee and use <strong>Set salary</strong> in their Salary panel, or import salaries in <strong>Payroll → Setup → Import salaries</strong>.
              Each salary is recorded from a date with its structure, so past months keep the pay they were worked out on.
            </p>
          </Card>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentView('people')}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            className="px-8 shadow-md"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Create & Save Employee
          </Button>
        </div>
      </form>
    </div>
  );
};
