import React, { useEffect, useId, useState } from 'react';
import {
  User,
  Briefcase,
  DollarSign,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  Building,
  ArrowRight,
  ArrowLeft,
  Search,
  Check,
  CreditCard,
  Shield,
  Loader2,
} from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { Badge } from '../../components/ui/Badge';
import {
  onboardingApi,
  type ConversionDefaults,
  type ConvertToEmployeeInput,
  type ConversionResult,
} from '../../api/onboarding.api';
import { employeesApi, type CosecLookupResult } from '../../api/employees.api';
import { toast } from '../../lib/toast';
import { fieldClass, labelClass } from './onboarding-format';

interface Props {
  candidateId: string;
  candidateName: string;
  onClose: () => void;
  onSuccess: (result: ConversionResult) => void;
}

type Step = 'personal' | 'employment' | 'compensation' | 'cosec' | 'review';

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'employment', label: 'Employment', icon: Briefcase },
  { key: 'compensation', label: 'Compensation & Bank', icon: DollarSign },
  { key: 'cosec', label: 'COSEC Biometrics', icon: Fingerprint },
  { key: 'review', label: 'Review & Confirm', icon: CheckCircle2 },
];

export const ConvertToEmployeeModal: React.FC<Props> = ({
  candidateId,
  candidateName,
  onClose,
  onSuccess,
}) => {
  const ids = useId();
  const [step, setStep] = useState<Step>('personal');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<ConversionDefaults | null>(null);

  // Form State
  const [form, setForm] = useState<ConvertToEmployeeInput>({
    employeeCode: '',
    firstName: '',
    middleName: '',
    lastName: '',
    workEmail: '',
    personalEmail: '',
    workMobile: '',
    dateOfBirth: '',
    genderCode: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    departmentId: '',
    designationId: '',
    employmentTypeId: '',
    branchId: '',
    employmentStatus: 'PROBATION',
    reportingManagerEmployeeId: '',
    currentAddressLine1: '',
    salaryStructureId: '',
    annualCtc: '',
    monthlyGrossTarget: '',
    salaryEffectiveFrom: new Date().toISOString().slice(0, 10),
    bankName: '',
    branchName: '',
    accountNumber: '',
    ifsc: '',
    accountHolderName: '',
    cosecEmployeeId: '',
  });

  // COSEC live lookup state
  const [cosecLookupBusy, setCosecLookupBusy] = useState(false);
  const [cosecLookupResult, setCosecLookupResult] = useState<CosecLookupResult | null>(null);

  // Load defaults
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    onboardingApi
      .getConversionDefaults(candidateId)
      .then((data) => {
        if (!mounted) return;
        setDefaults(data);
        const d = data.defaults;
        setForm((prev) => ({
          ...prev,
          employeeCode: d.employeeCode || '',
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          workEmail: d.workEmail || '',
          personalEmail: d.personalEmail || '',
          workMobile: d.workMobile || '',
          dateOfBirth: d.dateOfBirth || '',
          genderCode: d.genderCode || '',
          joiningDate: d.joiningDate || new Date().toISOString().slice(0, 10),
          departmentId: d.departmentId || '',
          designationId: d.designationId || '',
          employmentTypeId: d.employmentTypeId || '',
          currentAddressLine1: d.currentAddressLine1 || '',
          annualCtc: d.annualCtc || '',
          monthlyGrossTarget: d.monthlyGrossTarget || '',
          salaryEffectiveFrom: d.salaryEffectiveFrom || new Date().toISOString().slice(0, 10),
          cosecEmployeeId: d.cosecEmployeeId || '',
          branchId: data.masters.branches[0]?.id || '',
          salaryStructureId: data.masters.salaryStructures[0]?.id || '',
        }));
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setError(err.message || 'Failed to load conversion defaults');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [candidateId]);

  const updateField = (field: keyof ConvertToEmployeeInput, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // auto-recalculate monthly gross if annualCtc changes
      if (field === 'annualCtc') {
        const ctc = parseFloat(value);
        if (!isNaN(ctc) && ctc > 0) {
          next.monthlyGrossTarget = (ctc / 12).toFixed(2);
        }
      }
      return next;
    });
  };

  const handleCosecVerify = async () => {
    const cosecId = form.cosecEmployeeId?.trim();
    if (!cosecId) {
      toast.error('Enter a COSEC Employee ID to verify');
      return;
    }
    setCosecLookupBusy(true);
    try {
      const res = await employeesApi.lookupCosecUser(cosecId);
      setCosecLookupResult(res);
      if (res.existsInCosec && res.cosecUser) {
        toast.success(`Verified: ${res.cosecUser.name} found in COSEC`);
      } else if (res.alreadyMapped && res.alreadyMappedTo) {
        toast.error(`Already mapped to ${res.alreadyMappedTo.employeeName} (${res.alreadyMappedTo.employeeCode})`);
      } else {
        toast.error('COSEC user not found or COSEC integration not configured');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'COSEC lookup failed';
      setCosecLookupResult({
        cosecId,
        isConfigured: false,
        existsInCosec: false,
        cosecUser: null,
        alreadyMapped: false,
        alreadyMappedTo: null,
      });
      toast.error(msg);
    } finally {
      setCosecLookupBusy(false);
    }
  };

  // Step validations
  const validateCurrentStep = (): boolean => {
    setError(null);
    if (step === 'personal') {
      if (!form.employeeCode.trim()) {
        setError('Employee Code is required');
        return false;
      }
      if (!form.firstName.trim()) {
        setError('First Name is required');
        return false;
      }
      if (form.workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail.trim())) {
        setError('Work Email format is invalid');
        return false;
      }
    } else if (step === 'employment') {
      if (!form.joiningDate) {
        setError('Joining Date is required');
        return false;
      }
    } else if (step === 'compensation') {
      if (form.annualCtc && isNaN(Number(form.annualCtc))) {
        setError('Annual CTC must be a valid number');
        return false;
      }
    }
    return true;
  };

  const goToNextStep = () => {
    if (!validateCurrentStep()) return;
    const order: Step[] = ['personal', 'employment', 'compensation', 'cosec', 'review'];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) {
      setStep(order[idx + 1]);
    }
  };

  const goToPrevStep = () => {
    setError(null);
    const order: Step[] = ['personal', 'employment', 'compensation', 'cosec', 'review'];
    const idx = order.indexOf(step);
    if (idx > 0) {
      setStep(order[idx - 1]);
    }
  };

  const handleSubmit = async () => {
    if (!form.employeeCode.trim() || !form.firstName.trim() || !form.joiningDate) {
      setError('Please fill in required fields: Employee Code, First Name, and Joining Date');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: ConvertToEmployeeInput = {
        ...form,
        employeeCode: form.employeeCode.trim(),
        firstName: form.firstName.trim(),
        middleName: form.middleName?.trim() || undefined,
        lastName: form.lastName?.trim() || undefined,
        workEmail: form.workEmail?.trim() || undefined,
        personalEmail: form.personalEmail?.trim() || undefined,
        workMobile: form.workMobile?.trim() || undefined,
        dateOfBirth: form.dateOfBirth?.trim() || undefined,
        genderCode: form.genderCode?.trim() || undefined,
        joiningDate: form.joiningDate,
        departmentId: form.departmentId || undefined,
        designationId: form.designationId || undefined,
        employmentTypeId: form.employmentTypeId || undefined,
        branchId: form.branchId || undefined,
        employmentStatus: form.employmentStatus || 'PROBATION',
        reportingManagerEmployeeId: form.reportingManagerEmployeeId || undefined,
        currentAddressLine1: form.currentAddressLine1?.trim() || undefined,
        salaryStructureId: form.salaryStructureId || undefined,
        annualCtc: form.annualCtc?.trim() || undefined,
        monthlyGrossTarget: form.monthlyGrossTarget?.trim() || undefined,
        salaryEffectiveFrom: form.salaryEffectiveFrom || form.joiningDate,
        bankName: form.bankName?.trim() || undefined,
        branchName: form.branchName?.trim() || undefined,
        accountNumber: form.accountNumber?.trim() || undefined,
        ifsc: form.ifsc?.trim() || undefined,
        accountHolderName: form.accountHolderName?.trim() || undefined,
        cosecEmployeeId: form.cosecEmployeeId?.trim() || undefined,
      };

      const result = await onboardingApi.convertToEmployee(candidateId, payload);
      toast.success(
        `Employee ${result.name} (${result.employeeCode}) created successfully! ` +
        (result.cosecMapping?.cosecEmployeeId
          ? `Mapped to COSEC ID: ${result.cosecMapping.cosecEmployeeId}`
          : 'COSEC mapping pending.')
      );
      onSuccess(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Conversion failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const masters = defaults?.masters;

  // Selected names for review step
  const selectedDept = masters?.departments.find((d) => d.id === form.departmentId)?.department_name;
  const selectedDesig = masters?.designations.find((d) => d.id === form.designationId)?.designation_name;
  const selectedType = masters?.employmentTypes.find((t) => t.id === form.employmentTypeId)?.employment_type_name;
  const selectedBranch = masters?.branches.find((b) => b.id === form.branchId)?.branch_name;
  const selectedManager = masters?.managers.find((m) => m.id === form.reportingManagerEmployeeId);
  const selectedStructure = masters?.salaryStructures.find((s) => s.id === form.salaryStructureId)?.salary_structure_name;

  return (
    <Dialog
      title={`Convert Candidate to Employee`}
      description={`Create official HRMS employee record for ${candidateName} and configure COSEC biometric attendance mapping.`}
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {step !== 'personal' && (
              <button
                type="button"
                onClick={goToPrevStep}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Previous
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            {step !== 'review' ? (
              <button
                type="button"
                onClick={goToNextStep}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
              >
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating Employee…
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Confirm & Convert to Employee
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Step Indicator */}
        <nav aria-label="Conversion Wizard Steps" className="border-b border-slate-200 dark:border-[#2B293E] pb-3">
          <ol className="flex items-center justify-between gap-1 overflow-x-auto py-1">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = step === s.key;
              const isPast = STEPS.findIndex((x) => x.key === step) > idx;
              return (
                <li key={s.key} className="flex-1 min-w-[110px]">
                  <button
                    type="button"
                    onClick={() => {
                      if (validateCurrentStep()) setStep(s.key);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                        : isPast
                        ? 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                        : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-teal-600 text-white'
                          : isPast
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-400'
                      }`}
                    >
                      {isPast ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {error && (
          <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to proceed</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            <p className="text-sm">Loading candidate details and HR masters…</p>
          </div>
        ) : (
          <div className="min-h-[320px]">
            {/* Step 1: Personal Info */}
            {step === 'personal' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <User className="w-4 h-4 text-teal-600" /> Personal Details
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${ids}-code`} className={labelClass}>
                      Employee Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={`${ids}-code`}
                      type="text"
                      required
                      value={form.employeeCode}
                      onChange={(e) => updateField('employeeCode', e.target.value.toUpperCase())}
                      className={fieldClass}
                      placeholder="e.g. EMP-0105"
                    />
                    <p className="text-[11px] text-slate-400 mt-0.5">Unique identifier for this employee</p>
                  </div>
                  <div>
                    <label htmlFor={`${ids}-first-name`} className={labelClass}>
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={`${ids}-first-name`}
                      type="text"
                      required
                      value={form.firstName}
                      onChange={(e) => updateField('firstName', e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${ids}-last-name`} className={labelClass}>
                      Last Name
                    </label>
                    <input
                      id={`${ids}-last-name`}
                      type="text"
                      value={form.lastName}
                      onChange={(e) => updateField('lastName', e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${ids}-work-email`} className={labelClass}>
                      Official Work Email
                    </label>
                    <input
                      id={`${ids}-work-email`}
                      type="email"
                      value={form.workEmail}
                      onChange={(e) => updateField('workEmail', e.target.value)}
                      className={fieldClass}
                      placeholder="employee@company.com"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${ids}-personal-email`} className={labelClass}>
                      Personal Email
                    </label>
                    <input
                      id={`${ids}-personal-email`}
                      type="email"
                      value={form.personalEmail}
                      onChange={(e) => updateField('personalEmail', e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${ids}-mobile`} className={labelClass}>
                      Mobile Number
                    </label>
                    <input
                      id={`${ids}-mobile`}
                      type="tel"
                      value={form.workMobile}
                      onChange={(e) => updateField('workMobile', e.target.value)}
                      className={fieldClass}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${ids}-dob`} className={labelClass}>
                      Date of Birth
                    </label>
                    <input
                      id={`${ids}-dob`}
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => updateField('dateOfBirth', e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${ids}-gender`} className={labelClass}>
                      Gender
                    </label>
                    <select
                      id={`${ids}-gender`}
                      value={form.genderCode}
                      onChange={(e) => updateField('genderCode', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select gender</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${ids}-address`} className={labelClass}>
                      Current Residential Address
                    </label>
                    <input
                      id={`${ids}-address`}
                      type="text"
                      value={form.currentAddressLine1}
                      onChange={(e) => updateField('currentAddressLine1', e.target.value)}
                      className={fieldClass}
                      placeholder="Street, City, State"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Employment Info */}
            {step === 'employment' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <Briefcase className="w-4 h-4 text-teal-600" /> Employment & Organization
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${ids}-joining-date`} className={labelClass}>
                      Joining Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={`${ids}-joining-date`}
                      type="date"
                      required
                      value={form.joiningDate}
                      onChange={(e) => updateField('joiningDate', e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${ids}-dept`} className={labelClass}>
                      Department
                    </label>
                    <select
                      id={`${ids}-dept`}
                      value={form.departmentId}
                      onChange={(e) => updateField('departmentId', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select department</option>
                      {masters?.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.department_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${ids}-desig`} className={labelClass}>
                      Designation
                    </label>
                    <select
                      id={`${ids}-desig`}
                      value={form.designationId}
                      onChange={(e) => updateField('designationId', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select designation</option>
                      {masters?.designations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.designation_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${ids}-emp-type`} className={labelClass}>
                      Employment Type
                    </label>
                    <select
                      id={`${ids}-emp-type`}
                      value={form.employmentTypeId}
                      onChange={(e) => updateField('employmentTypeId', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select employment type</option>
                      {masters?.employmentTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.employment_type_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${ids}-branch`} className={labelClass}>
                      Work Location / Branch
                    </label>
                    <select
                      id={`${ids}-branch`}
                      value={form.branchId}
                      onChange={(e) => updateField('branchId', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select branch</option>
                      {masters?.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.branch_name} ({b.branch_code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${ids}-status`} className={labelClass}>
                      Employment Status
                    </label>
                    <select
                      id={`${ids}-status`}
                      value={form.employmentStatus}
                      onChange={(e) => updateField('employmentStatus', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="PROBATION">Probation</option>
                      <option value="CONFIRMED">Confirmed / Permanent</option>
                      <option value="TRAINEE">Trainee</option>
                      <option value="CONTRACT">Contract</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`${ids}-manager`} className={labelClass}>
                      Reporting Manager
                    </label>
                    <select
                      id={`${ids}-manager`}
                      value={form.reportingManagerEmployeeId}
                      onChange={(e) => updateField('reportingManagerEmployeeId', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">No manager (direct reporting)</option>
                      {masters?.managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.employeeCode})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Compensation & Bank */}
            {step === 'compensation' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <DollarSign className="w-4 h-4 text-teal-600" /> Salary Structure & Compensation
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${ids}-struct`} className={labelClass}>
                      Salary Structure
                    </label>
                    <select
                      id={`${ids}-struct`}
                      value={form.salaryStructureId}
                      onChange={(e) => updateField('salaryStructureId', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">No structure assigned yet</option>
                      {masters?.salaryStructures.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.salary_structure_name} ({s.salary_structure_code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${ids}-ctc`} className={labelClass}>
                      Annual CTC (₹)
                    </label>
                    <input
                      id={`${ids}-ctc`}
                      type="number"
                      min="0"
                      step="1"
                      value={form.annualCtc}
                      onChange={(e) => updateField('annualCtc', e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. 600000"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${ids}-monthly`} className={labelClass}>
                      Target Monthly Gross (₹)
                    </label>
                    <input
                      id={`${ids}-monthly`}
                      type="number"
                      min="0"
                      step="1"
                      value={form.monthlyGrossTarget}
                      onChange={(e) => updateField('monthlyGrossTarget', e.target.value)}
                      className={fieldClass}
                      placeholder="Derived or fixed"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-[#2B293E]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                    <CreditCard className="w-4 h-4 text-teal-600" /> Bank Account (Optional)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor={`${ids}-bank-name`} className={labelClass}>
                        Bank Name
                      </label>
                      <input
                        id={`${ids}-bank-name`}
                        type="text"
                        value={form.bankName}
                        onChange={(e) => updateField('bankName', e.target.value)}
                        className={fieldClass}
                        placeholder="e.g. HDFC Bank"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${ids}-acc-num`} className={labelClass}>
                        Account Number
                      </label>
                      <input
                        id={`${ids}-acc-num`}
                        type="text"
                        value={form.accountNumber}
                        onChange={(e) => updateField('accountNumber', e.target.value)}
                        className={fieldClass}
                        placeholder="e.g. 50100234567890"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${ids}-ifsc`} className={labelClass}>
                        IFSC Code
                      </label>
                      <input
                        id={`${ids}-ifsc`}
                        type="text"
                        value={form.ifsc}
                        onChange={(e) => updateField('ifsc', e.target.value.toUpperCase())}
                        className={fieldClass}
                        placeholder="e.g. HDFC0001234"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: COSEC Biometric Mapping */}
            {step === 'cosec' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <Fingerprint className="w-4 h-4 text-teal-600" /> Matrix COSEC Attendance Integration
                </div>

                <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 text-xs text-teal-900 dark:text-teal-200 space-y-1.5">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-teal-600" /> Decoupled Onboarding & Biometrics
                  </p>
                  <p>
                    Entering a Matrix COSEC Employee ID is optional. If this candidate is already registered on the biometric terminal, enter their COSEC ID below to link them immediately.
                  </p>
                  <p>
                    If they have not been enrolled on the biometric device yet, you can leave this blank. The employee will be created with status{' '}
                    <span className="font-semibold underline">COSEC Mapping Pending</span> and can be mapped or automatically reconciled later.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label htmlFor={`${ids}-cosec-id`} className={labelClass}>
                      COSEC Employee ID / User Reference Code
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`${ids}-cosec-id`}
                        type="text"
                        value={form.cosecEmployeeId}
                        onChange={(e) => {
                          updateField('cosecEmployeeId', e.target.value);
                          setCosecLookupResult(null);
                        }}
                        className={fieldClass}
                        placeholder="e.g. 1024 or MATRIX-USER-01"
                      />
                      <button
                        type="button"
                        onClick={handleCosecVerify}
                        disabled={cosecLookupBusy || !form.cosecEmployeeId?.trim()}
                        className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
                      >
                        {cosecLookupBusy ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" /> Verify in COSEC
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {cosecLookupResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        cosecLookupResult.existsInCosec && cosecLookupResult.cosecUser
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                      }`}
                    >
                      {cosecLookupResult.existsInCosec && cosecLookupResult.cosecUser ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        {cosecLookupResult.existsInCosec && cosecLookupResult.cosecUser ? (
                          <>
                            <p className="font-semibold">Verified in Matrix COSEC</p>
                            <p>
                              User: <span className="font-semibold">{cosecLookupResult.cosecUser.name}</span> (ID:{' '}
                              {cosecLookupResult.cosecUser.cosecUserId})
                              {cosecLookupResult.cosecUser.department ? ` · Dept: ${cosecLookupResult.cosecUser.department}` : ''}
                            </p>
                          </>
                        ) : cosecLookupResult.alreadyMapped && cosecLookupResult.alreadyMappedTo ? (
                          <>
                            <p className="font-semibold">Already Mapped to Another Employee</p>
                            <p>
                              This COSEC ID is mapped to {cosecLookupResult.alreadyMappedTo.employeeName} ({cosecLookupResult.alreadyMappedTo.employeeCode}).
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold">User Not Found on COSEC Device</p>
                            <p>
                              The ID was not found in the COSEC database or the biometric integration is unreachable. You can still save it; the mapping status will be set to Mapping Requires Review or Pending.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {!form.cosecEmployeeId?.trim() && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-[#2B293E]">
                      <Badge variant="neutral" size="sm">
                        Pending
                      </Badge>
                      <span>No COSEC ID specified. Initial mapping status will be <strong>COSEC Mapping Pending</strong>.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 5: Review & Confirm */}
            {step === 'review' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-teal-600" /> Summary Confirmation
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Card 1: Identity & Employment */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] space-y-2">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-teal-600" /> Employee & Organization
                    </p>
                    <div className="space-y-1 text-slate-600 dark:text-slate-300">
                      <div>
                        <span className="text-slate-400">Employee Code:</span>{' '}
                        <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                          {form.employeeCode}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Name:</span>{' '}
                        <span className="font-semibold">
                          {[form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Work Email:</span> {form.workEmail || '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Joining Date:</span>{' '}
                        <span className="font-semibold text-teal-700 dark:text-teal-400">
                          {form.joiningDate}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Department:</span> {selectedDept || '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Designation:</span> {selectedDesig || '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Type / Status:</span> {selectedType || '—'} ({form.employmentStatus})
                      </div>
                      <div>
                        <span className="text-slate-400">Branch:</span> {selectedBranch || '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Reporting Manager:</span>{' '}
                        {selectedManager ? `${selectedManager.name} (${selectedManager.employeeCode})` : 'None'}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Compensation & COSEC */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] space-y-2">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-teal-600" /> Compensation & Biometrics
                    </p>
                    <div className="space-y-1 text-slate-600 dark:text-slate-300">
                      <div>
                        <span className="text-slate-400">Salary Structure:</span>{' '}
                        {selectedStructure || 'None assigned'}
                      </div>
                      <div>
                        <span className="text-slate-400">Annual CTC:</span>{' '}
                        {form.annualCtc ? `₹${Number(form.annualCtc).toLocaleString('en-IN')}` : '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Monthly Gross:</span>{' '}
                        {form.monthlyGrossTarget ? `₹${Number(form.monthlyGrossTarget).toLocaleString('en-IN')}` : '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Bank Account:</span>{' '}
                        {form.accountNumber
                          ? `${form.bankName || 'Bank'} (•••• ${form.accountNumber.slice(-4)})`
                          : 'Not provided'}
                      </div>
                      <div className="pt-2 border-t border-slate-200 dark:border-[#2B293E]">
                        <span className="text-slate-400">COSEC Status:</span>{' '}
                        {form.cosecEmployeeId?.trim() ? (
                          <Badge variant="success" size="sm">
                            Mapped ({form.cosecEmployeeId.trim()})
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm">
                            COSEC Mapping Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
                  <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Final Confirmation:</strong> Submitting will create a new official HRMS employee record, mark candidate stage as <strong>Joined</strong>, record candidate history events, and enable attendance tracking. Duplicate conversions are locked out.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};
