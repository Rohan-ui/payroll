import React, { useId, useRef, useState } from 'react';
import { ArrowLeft, Plus, ExternalLink } from 'lucide-react';
import { onboardingApi, type CandidateDetail, type CandidateInput, type OnboardingMeta } from '../../api/onboarding.api';
import { employmentTypesApi } from '../../api/employment-types.api';
import { useAuth } from '../../context/AuthContext';
import { useOptionalPayroll } from '../../context/PayrollContext';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { fieldClass, labelClass } from './onboarding-format';

interface Props {
  candidate: CandidateDetail | null;
  meta: OnboardingMeta | null;
  onCancel: () => void;
  onSaved: (candidate: CandidateDetail) => void;
  onRefreshMeta?: () => Promise<void> | void;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const YEARS = /^\d{1,2}(\.\d)?$/;

/** Adding a candidate, or editing one. Their stage is not edited here: it moves through the workflow. */
export const CandidateForm: React.FC<Props> = ({ candidate, meta, onCancel, onSaved, onRefreshMeta }) => {
  const ids = useId();
  const { can } = useAuth();
  const payroll = useOptionalPayroll();
  const canManageEmploymentTypes = can('organization.update') || can('organization.view');

  const [values, setValues] = useState<Record<keyof CandidateInput, string>>({
    fullName: candidate?.fullName ?? '',
    email: candidate?.email ?? '',
    phone: candidate?.phone ?? '',
    address: candidate?.address ?? '',
    appliedPosition: candidate?.appliedPosition ?? '',
    departmentId: candidate?.departmentId ?? '',
    designationId: candidate?.designationId ?? '',
    employmentTypeId: candidate?.employmentTypeId ?? '',
    hiringSource: candidate?.hiringSource ?? '',
    expectedSalary: candidate?.expectedSalary ?? '',
    experienceYears: candidate?.experienceYears ?? '',
    expectedJoiningDate: candidate?.expectedJoiningDate ?? '',
    recruiterMemberId: candidate?.recruiterMemberId ?? '',
    notes: candidate?.notes ?? '',
  });
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  // Quick add employment type modal
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddDescription, setQuickAddDescription] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const errors: Partial<Record<keyof CandidateInput, string>> = {};
  if (!values.fullName.trim()) errors.fullName = 'Enter the candidate’s full name.';
  if (!EMAIL.test(values.email.trim())) errors.email = 'Enter a valid email address.';
  if (!values.appliedPosition.trim()) errors.appliedPosition = 'Enter the position applied for.';
  if (values.expectedSalary && !MONEY.test(values.expectedSalary.trim())) errors.expectedSalary = 'Enter an amount like 1200000 or 1200000.50, without commas.';
  if (values.experienceYears && !YEARS.test(values.experienceYears.trim())) errors.experienceYears = 'Enter the years, like 4 or 4.5.';

  const field = (name: keyof CandidateInput) => ({
    id: `${ids}-${name}`,
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [name]: e.target.value })),
    'aria-invalid': showErrors && Boolean(errors[name]),
    'aria-describedby': showErrors && errors[name] ? `${ids}-${name}-error` : undefined,
    className: fieldClass,
  });
  const error = (name: keyof CandidateInput) =>
    showErrors && errors[name] ? <p id={`${ids}-${name}-error`} className="mt-1 text-xs text-red-700">{errors[name]}</p> : null;

  const openEmploymentTypeSettings = () => {
    try {
      window.history.pushState(null, '', '/organization?tab=employment-types');
    } catch {
      // ignore
    }
    if (payroll?.setCurrentView) {
      payroll.setCurrentView('organization');
    } else {
      try {
        window.location.assign('/organization?tab=employment-types');
      } catch {
        // ignore
      }
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddName.trim()) {
      setQuickAddError('Name is required');
      return;
    }
    setQuickAddSaving(true);
    setQuickAddError(null);
    try {
      const created = await employmentTypesApi.create({
        name: quickAddName.trim(),
        description: quickAddDescription.trim() || undefined,
      });
      toast.success(`Employment type "${created.name}" created`);
      if (onRefreshMeta) {
        await onRefreshMeta();
      }
      setValues((prev) => ({ ...prev, employmentTypeId: created.id }));
      setShowQuickAddModal(false);
      setQuickAddName('');
      setQuickAddDescription('');
    } catch (err) {
      setQuickAddError(err instanceof Error ? err.message : 'Failed to create employment type');
    } finally {
      setQuickAddSaving(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setShowErrors(true);
    setServerError(null);
    if (Object.keys(errors).length > 0) return;
    const input: CandidateInput = {
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      appliedPosition: values.appliedPosition.trim(),
    };
    for (const key of Object.keys(values) as (keyof CandidateInput)[]) {
      const value = values[key].trim();
      if (value && !(key in input)) (input as unknown as Record<string, string>)[key] = value;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const saved = candidate ? await onboardingApi.updateCandidate(candidate.id, input) : await onboardingApi.createCandidate(input);
      toast.success(candidate ? 'Candidate updated' : `Candidate ${saved.candidateCode} added`);
      onSaved(saved);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'The candidate could not be saved.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const hasConfiguredTypes = Boolean(meta && meta.employmentTypes && meta.employmentTypes.length > 0);
  const candidateHasInactiveAssignedType = Boolean(
    candidate?.employmentTypeId &&
    !meta?.employmentTypes.some((t) => t.id === candidate.employmentTypeId)
  );

  return (
    <form onSubmit={save} noValidate className="space-y-5 max-w-4xl" aria-labelledby={`${ids}-title`}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} aria-label="Back" className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <div>
          <h1 id={`${ids}-title`} className="text-xl font-bold text-slate-900 dark:text-slate-100">{candidate ? `Edit ${candidate.fullName}` : 'Add candidate'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Fields marked * are required.</p>
        </div>
      </div>

      {serverError && <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">{serverError}</div>}

      <fieldset className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] grid grid-cols-1 sm:grid-cols-2 gap-4">
        <legend className="px-1 text-sm font-bold text-slate-900 dark:text-slate-100">Contact</legend>
        <div><label htmlFor={`${ids}-fullName`} className={labelClass}>Full name *</label><input {...field('fullName')} maxLength={200} autoComplete="off" />{error('fullName')}</div>
        <div><label htmlFor={`${ids}-email`} className={labelClass}>Email *</label><input {...field('email')} type="email" maxLength={320} />{error('email')}</div>
        <div><label htmlFor={`${ids}-phone`} className={labelClass}>Phone</label><input {...field('phone')} type="tel" maxLength={32} /></div>
        <div className="sm:col-span-2"><label htmlFor={`${ids}-address`} className={labelClass}>Address</label><textarea {...field('address')} rows={2} maxLength={2000} /></div>
      </fieldset>

      <fieldset className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] grid grid-cols-1 sm:grid-cols-2 gap-4">
        <legend className="px-1 text-sm font-bold text-slate-900 dark:text-slate-100">Role applied for</legend>
        <div><label htmlFor={`${ids}-appliedPosition`} className={labelClass}>Position *</label><input {...field('appliedPosition')} maxLength={160} />{error('appliedPosition')}</div>
        <div>
          <label htmlFor={`${ids}-departmentId`} className={labelClass}>Department</label>
          <select {...field('departmentId')}><option value="">Not decided</option>{meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </div>
        <div>
          <label htmlFor={`${ids}-designationId`} className={labelClass}>Designation</label>
          <select {...field('designationId')}><option value="">Not decided</option>{meta?.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor={`${ids}-employmentTypeId`} className={labelClass}>Employment type</label>
            {canManageEmploymentTypes && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuickAddName('');
                    setQuickAddDescription('');
                    setQuickAddError(null);
                    setShowQuickAddModal(true);
                  }}
                  className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  Add new
                </button>
                <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={openEmploymentTypeSettings}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  title="Manage employment types in Organization Settings"
                >
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  Settings
                </button>
              </div>
            )}
          </div>
          <select {...field('employmentTypeId')}>
            {hasConfiguredTypes ? (
              <>
                <option value="">Not decided</option>
                {meta?.employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </>
            ) : (
              <option value="">No employment types have been configured.</option>
            )}
            {candidateHasInactiveAssignedType && (
              <option value={candidate!.employmentTypeId!}>
                {candidate!.employmentTypeName || 'Assigned type'} (Inactive)
              </option>
            )}
          </select>
          {!hasConfiguredTypes && (
            <div className="mt-1.5 text-xs">
              {canManageEmploymentTypes ? (
                <p className="text-slate-500 dark:text-slate-400">
                  No employment types have been configured.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddName('');
                      setQuickAddDescription('');
                      setQuickAddError(null);
                      setShowQuickAddModal(true);
                    }}
                    className="font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    Create one now
                  </button>
                  {' or '}
                  <button
                    type="button"
                    onClick={openEmploymentTypeSettings}
                    className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    open Settings
                  </button>
                  .
                </p>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">
                  No employment types have been configured.
                </p>
              )}
            </div>
          )}
        </div>
        <div><label htmlFor={`${ids}-hiringSource`} className={labelClass}>Hiring source</label><input {...field('hiringSource')} maxLength={64} placeholder="e.g. Referral, LinkedIn, Job portal" /></div>
        <div>
          <label htmlFor={`${ids}-recruiterMemberId`} className={labelClass}>Recruiter</label>
          <select {...field('recruiterMemberId')}><option value="">Unassigned</option>{meta?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </div>
      </fieldset>

      <fieldset className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] grid grid-cols-1 sm:grid-cols-3 gap-4">
        <legend className="px-1 text-sm font-bold text-slate-900 dark:text-slate-100">Experience and expectations</legend>
        <div><label htmlFor={`${ids}-experienceYears`} className={labelClass}>Experience (years)</label><input {...field('experienceYears')} inputMode="decimal" />{error('experienceYears')}</div>
        <div><label htmlFor={`${ids}-expectedSalary`} className={labelClass}>Expected salary (₹ per year)</label><input {...field('expectedSalary')} inputMode="decimal" />{error('expectedSalary')}</div>
        <div><label htmlFor={`${ids}-expectedJoiningDate`} className={labelClass}>Expected joining date</label><input {...field('expectedJoiningDate')} type="date" /></div>
        <div className="sm:col-span-3"><label htmlFor={`${ids}-notes`} className={labelClass}>Notes</label><textarea {...field('notes')} rows={3} maxLength={5000} /></div>
      </fieldset>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50">
          {saving ? 'Saving…' : candidate ? 'Save changes' : 'Add candidate'}
        </button>
      </div>

      {showQuickAddModal && (
        <Dialog
          title="Add Employment Type"
          description="Create a new employment type option for candidates and employees."
          onClose={() => {
            if (!quickAddSaving) setShowQuickAddModal(false);
          }}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                disabled={quickAddSaving}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={quickAddSaving || !quickAddName.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
              >
                {quickAddSaving ? 'Creating…' : 'Create & Select'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {quickAddError && (
              <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">
                {quickAddError}
              </div>
            )}
            <div>
              <label htmlFor={`${ids}-quick-et-name`} className={labelClass}>
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id={`${ids}-quick-et-name`}
                type="text"
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                placeholder="e.g. Full-time, Probationary, Consultant"
                maxLength={100}
                className={fieldClass}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor={`${ids}-quick-et-desc`} className={labelClass}>
                Description (Optional)
              </label>
              <textarea
                id={`${ids}-quick-et-desc`}
                value={quickAddDescription}
                onChange={(e) => setQuickAddDescription(e.target.value)}
                placeholder="Brief description of this employment category"
                rows={2}
                maxLength={500}
                className={fieldClass}
              />
            </div>
          </div>
        </Dialog>
      )}
    </form>
  );
};
