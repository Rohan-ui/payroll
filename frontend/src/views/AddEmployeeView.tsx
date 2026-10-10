import React, { useState, useEffect, useCallback } from 'react';
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
import { Badge } from '../components/ui/Badge';
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
  const {
    currentView,
    selectedEmployeeId,
    setCurrentView,
    addEmployee,
    updateEmployee,
    refreshData,
    employees,
  } = usePayroll();

  const isEdit = currentView === 'edit-employee';
  const employeeToEdit = isEdit
    ? employees.find((e) => e.id === selectedEmployeeId) ?? employees[0]
    : null;

  // Basic Information
  const [employeeCode, setEmployeeCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [employeeStatus, setEmployeeStatus] = useState<string>('ACTIVE');
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

  // Auto-generate next employee code in create mode or populate employee in edit mode
  useEffect(() => {
    if (isEdit && employeeToEdit) {
      setEmployeeCode(employeeToEdit.code);
      setFullName(employeeToEdit.name);
      setEmployeeStatus(employeeToEdit.status);
      setWorkEmail(employeeToEdit.workEmail);
      setMobileNumber(employeeToEdit.mobileNumber || '');
      setJoiningDate(employeeToEdit.joiningDate || new Date().toISOString().split('T')[0]);

      if (employeeToEdit.department) {
        setSelectedDept(employeeToEdit.department);
      }
      if (employeeToEdit.designation) {
        setSelectedDesig(employeeToEdit.designation);
      }

      if (employeeToEdit.bank) {
        setIfsc(employeeToEdit.bank.ifsc || '');
        setBankName(employeeToEdit.bank.bankName || '');
        const rawAcc = employeeToEdit.bank.accountNumber || '';
        setAccountNumber(rawAcc);
        setConfirmAccountNumber(rawAcc);
        if (employeeToEdit.bank.isValidIfsc) {
          setIfscInfo({
            valid: true,
            bank: employeeToEdit.bank.bankName,
            branch: employeeToEdit.bank.branchName,
            ifsc: employeeToEdit.bank.ifsc,
          });
        }
      }

    } else if (!isEdit) {
      if (!employeeCode) {
        const nextNum = employees.length + 1;
        const suggested = `RND${String(nextNum).padStart(3, '0')}`;
        setEmployeeCode(suggested);
      }
    }
  }, [isEdit, employeeToEdit, employees.length]);

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
      if (isEdit && employeeToEdit) {
        if (accountNumber && confirmAccountNumber && accountNumber !== confirmAccountNumber) {
          setErrorMessage('New bank account number and confirm account number do not match.');
          setIsSubmitting(false);
          return;
        }

        await updateEmployee(employeeToEdit.id, {
          code: employeeCode.trim().toUpperCase(),
          name: fullName.trim(),
          status: employeeStatus as any,
          department: finalDepartment,
          designation: finalDesignation || '',
          workEmail: workEmail.trim().toLowerCase(),
          mobileNumber: mobileNumber.trim(),
          joiningDate: joiningDate || employeeToEdit.joiningDate,
          bankAccountNumber: accountNumber.trim() || undefined,
          bank: {
            bankName: bankName.trim() || ifscInfo?.bank || employeeToEdit.bank?.bankName || '',
            branchName: branchName.trim() || ifscInfo?.branch || employeeToEdit.bank?.branchName,
            ifsc: ifsc.trim().toUpperCase() || employeeToEdit.bank?.ifsc || '',
            accountNumber: accountNumber.trim() || undefined,
            accountNumberMasked: accountNumber.trim()
              ? `••••${accountNumber.trim().slice(-4)}`
              : employeeToEdit.bank?.accountNumberMasked ?? 'Not recorded',
            accountHolder: fullName.trim(),
            isValidIfsc: !!ifscInfo?.valid || !!employeeToEdit.bank?.isValidIfsc,
          },
        });

        setSuccessMessage(`Employee ${fullName} (${employeeCode}) profile was successfully updated!`);
        await refreshData();

        setTimeout(() => {
          setCurrentView('employee-detail');
        }, 1200);
      } else {
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
      }
    } catch (err: any) {
      console.error('Failed to save employee:', err);
      setErrorMessage(err?.message || 'Failed to save employee. Please verify details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all';

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Top Breadcrumb & Page Title */}
      <div>
        <button
          type="button"
          onClick={() => setCurrentView(isEdit ? 'employee-detail' : 'people')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0E5A47] transition-colors mb-2 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {isEdit ? 'Back to Employee Profile' : 'Back to People Directory'}
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">
                {isEdit ? `Edit Employee Profile` : 'Add New Employee'}
              </h1>
              {isEdit && employeeToEdit && (
                <Badge variant="neutral" size="sm">
                  {employeeToEdit.code}
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {isEdit
                ? `Edit official employee profile for ${employeeToEdit?.name || 'staff'}, designation, bank deposit & statutory settings`
                : 'Create an official employee profile with dynamic department & Razorpay IFSC validation'}
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2.5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2.5 p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-2xl shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Identity & Employment Information */}
        <Card
          title="1. Personal & Employment Details"
          subtitle="Official employment identifier, designation, and contact information"
        >
          <div className="space-y-4 pt-1">
            {/* Identity & Contact Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Employee Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Employee Code *
                </label>
                <input
                  type="text"
                  required
                  disabled={isEdit}
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                  placeholder="e.g. RND009"
                  className={`${inputClass} font-mono font-medium ${isEdit ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {isEdit ? 'Permanent employee identifier (read-only)' : 'Unique staff code for punches and payslips'}
                </p>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Legal name as shown in official documents
                </p>
              </div>

              {/* Work Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Work Email *
                </label>
                <input
                  type="email"
                  required
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  placeholder="e.g. priya@company.in"
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Official tenant email for system access
                </p>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Primary contact number for notifications
                </p>
              </div>
            </div>

            {/* Department, Designation, Joining Date & Status */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${isEdit ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 pt-1 border-t border-slate-100`}>
              {/* Dynamic Department */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Department *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDept(!isCustomDept);
                      if (!isCustomDept) setCustomDept('');
                    }}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                  >
                    {isCustomDept ? '← Choose Existing' : '+ Enter New Department'}
                  </button>
                </div>

                {isCustomDept ? (
                  <div className="space-y-1">
                    <input
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
                  <select
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
                  <label className="block text-xs font-semibold text-slate-700">
                    Designation
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDesig(!isCustomDesig);
                      if (!isCustomDesig) setCustomDesig('');
                    }}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                  >
                    {isCustomDesig ? '← Choose Existing' : '+ Enter New Designation'}
                  </button>
                </div>

                {isCustomDesig ? (
                  <input
                    type="text"
                    value={customDesig}
                    onChange={(e) => setCustomDesig(e.target.value)}
                    placeholder="Type custom role (e.g. Senior Product Architect)"
                    className={`${inputClass} border-teal-300 ring-1 ring-teal-200`}
                  />
                ) : (
                  <select
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Joining Date *
                </label>
                <input
                  type="date"
                  required
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Official date of commencement of employment
                </p>
              </div>

              {/* Status (Edit Mode) */}
              {isEdit && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Employment Status *
                  </label>
                  <select
                    value={employeeStatus}
                    onChange={(e) => setEmployeeStatus(e.target.value)}
                    className={inputClass}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="ON_NOTICE">On Notice</option>
                    <option value="RESIGNED">Resigned</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Current HR lifecycle status
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* 2 & 3: Bank Details & Compensation Side-by-Side on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 2. Bank Details with Razorpay IFSC Verification */}
          <Card
            title="2. Bank Details & Direct Deposit Advice"
            subtitle="All IFSC codes are verified in real time using the official Razorpay Bank Directory"
          >
            <div className="space-y-4 pt-1">
              {/* IFSC Code with Live Verification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      IFSC Code *
                    </label>
                    <span className="text-[10px] text-teal-700 font-bold uppercase tracking-wider">
                      Razorpay Checked
                    </span>
                  </div>
                  <div className="relative">
                    <input
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Auto-filled from IFSC"
                    className={inputClass}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Populates automatically when a valid IFSC is entered
                  </p>
                </div>
              </div>

              {/* Account Number & Confirm Account Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Account Number {isEdit ? '' : '*'}
                  </label>
                  <div className="relative">
                    <input
                      type={showAccountNumber ? 'text' : 'password'}
                      required={!isEdit}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder={isEdit ? (employeeToEdit?.bank?.accountNumberMasked || '••••••••') : 'e.g. 50100123456789'}
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
                  {isEdit && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Leave blank to keep current saved account
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Confirm Account Number {isEdit ? '' : '*'}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmAccountNumber ? 'text' : 'password'}
                      required={!isEdit && !!accountNumber}
                      value={confirmAccountNumber}
                      onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder={isEdit && !accountNumber ? 'Unchanged' : 'Re-type account number'}
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
          <Card title="3. Salary" subtitle="Kept in Payroll, with its history">
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
            onClick={() => setCurrentView(isEdit ? 'employee-detail' : 'people')}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            className="px-8 shadow-md"
          >
            {isEdit ? <CheckCircle2 className="w-4 h-4 mr-1.5" /> : <UserPlus className="w-4 h-4 mr-1.5" />}
            {isEdit ? 'Save Changes' : 'Create & Save Employee'}
          </Button>
        </div>
      </form>
    </div>
  );
};
