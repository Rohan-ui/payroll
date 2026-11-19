import React, { useId, useRef, useState } from 'react';
import { ArrowLeft, Plus, ExternalLink } from 'lucide-react';
import { onboardingApi, type CandidateDetail, type CandidateInput, type OnboardingMeta } from '../../api/onboarding.api';
import { employmentTypesApi } from '../../api/employment-types.api';
import { useAuth } from '../../context/AuthContext';
import { useOptionalPayroll } from '../../context/PayrollContext';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { fieldClass, labelClass } from './onboarding-format';
import { describeDeliveries } from './CandidateFormPanel';

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
  const isNew = !candidate;
  // A new candidate can be sent their information form straight away.
  const [sendBy, setSendBy] = useState({ email: true, whatsapp: false });
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
      const channels = [...(sendBy.email ? ['EMAIL' as const] : []), ...(sendBy.whatsapp && input.phone ? ['WHATSAPP' as const] : [])];
      if (isNew && channels.length > 0) {
        // The candidate is saved either way; a failed send is reported and can be retried from their page.
        try {
          const sent = await onboardingApi.sendForm(saved.id, undefined, channels);
          const summary = describeDeliveries(sent.notifications);
          if (summary) (summary.tone === 'ok' ? toast.success : toast.error)(`Candidate form: ${summary.text}`);
          onSaved(sent.candidate);
          return;
        } catch (e) {
          toast.error(`The candidate was added, but the form wasn't sent: ${e instanceof Error ? e.message : 'try again from their page.'}`);
        }
      }
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
    <form onSubmit={save} noValidate className="mx-auto w-full max-w-5xl space-y-5" aria-labelledby={`${ids}-title`}>
      <header className="flex items-start gap-3">
        <button type="button" onClick={onCancel} aria-label="Back" className="mt-0.5 rounded-lg border border-slate-200 p-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-[#2B293E] dark:hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <h1 id={`${ids}-title`} className="text-xl font-bold text-slate-900 dark:text-slate-100">{candidate ? `Edit ${candidate.fullName}` : 'Add candidate'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isNew ? 'Just the essentials. The candidate fills in the rest through their form.' : 'Fields marked * are required.'}
          </p>
        </div>
      </header>

      {serverError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{serverError}</div>}

      <FormSection title="Candidate">
        <Cell label="Full name" htmlFor={`${ids}-fullName`} required error={error('fullName')}><input {...field('fullName')} maxLength={200} autoComplete="off" /></Cell>
        <Cell label="Email" htmlFor={`${ids}-email`} required error={error('email')}><input {...field('email')} type="email" maxLength={320} /></Cell>
        <Cell label="Mobile number" htmlFor={`${ids}-phone`}><input {...field('phone')} type="tel" maxLength={32} placeholder="+91 98765 43210" /></Cell>
        {!isNew && <Cell label="Address" htmlFor={`${ids}-address`} span="full"><textarea {...field('address')} rows={2} maxLength={2000} /></Cell>}
      </FormSection>

      <FormSection title="Role applied for">
        <Cell label="Position" htmlFor={`${ids}-appliedPosition`} required error={error('appliedPosition')}><input {...field('appliedPosition')} maxLength={160} placeholder="e.g. Accountant" /></Cell>
        <Cell label="Department" htmlFor={`${ids}-departmentId`}>
          <select {...field('departmentId')}><option value="">Not decided</option>{meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </Cell>
        <Cell label="Designation" htmlFor={`${ids}-designationId`}>
          <select {...field('designationId')}><option value="">Not decided</option>{meta?.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </Cell>
        <Cell
          label="Employment type"
          htmlFor={`${ids}-employmentTypeId`}
          hint={!hasConfiguredTypes ? (
            <>No employment types have been configured.{canManageEmploymentTypes && (
              <>{' '}<button type="button" className="font-semibold text-teal-600 hover:underline dark:text-teal-400"
                onClick={() => { setQuickAddName(''); setQuickAddDescription(''); setQuickAddError(null); setShowQuickAddModal(true); }}>Create one now</button></>
            )}</>
          ) : undefined}
          extra={canManageEmploymentTypes && (
            <span className="flex items-center gap-2 text-[11px] font-semibold">
              <button type="button" className="inline-flex items-center gap-0.5 text-teal-700 hover:underline dark:text-teal-300"
                onClick={() => { setQuickAddName(''); setQuickAddDescription(''); setQuickAddError(null); setShowQuickAddModal(true); }}>
                <Plus className="h-3 w-3" aria-hidden="true" /> Add new
              </button>
              <button type="button" onClick={openEmploymentTypeSettings} title="Manage employment types in Organization Settings"
                className="inline-flex items-center gap-0.5 text-slate-500 hover:underline dark:text-slate-400">
                <ExternalLink className="h-3 w-3" aria-hidden="true" /> Settings
              </button>
            </span>
          )}
        >
          <select {...field('employmentTypeId')} disabled={!hasConfiguredTypes && !candidateHasInactiveAssignedType}>
            <option value="">{hasConfiguredTypes ? 'Not decided' : 'No employment types have been configured.'}</option>
            {meta?.employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            {candidateHasInactiveAssignedType && candidate?.employmentTypeId && (
              <option value={candidate.employmentTypeId}>{candidate.employmentTypeName || 'Assigned type'} (Inactive)</option>
            )}
          </select>
        </Cell>
        <Cell label="Recruitment source" htmlFor={`${ids}-hiringSource`}><input {...field('hiringSource')} maxLength={64} placeholder="e.g. Referral, LinkedIn" /></Cell>
        <Cell label="Recruiter" htmlFor={`${ids}-recruiterMemberId`}>
          <select {...field('recruiterMemberId')}><option value="">Unassigned</option>{meta?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </Cell>
      </FormSection>

      {!isNew && (
        <FormSection title="Experience and expectations">
          <Cell label="Experience (years)" htmlFor={`${ids}-experienceYears`} error={error('experienceYears')}><input {...field('experienceYears')} inputMode="decimal" /></Cell>
          <Cell label="Expected salary (₹ per year)" htmlFor={`${ids}-expectedSalary`} error={error('expectedSalary')}><input {...field('expectedSalary')} inputMode="decimal" /></Cell>
          <Cell label="Expected joining date" htmlFor={`${ids}-expectedJoiningDate`}><input {...field('expectedJoiningDate')} type="date" /></Cell>
        </FormSection>
      )}

      <FormSection title="Remarks">
        <Cell label="Remarks" htmlFor={`${ids}-notes`} span="full" hideLabel>
          <textarea {...field('notes')} rows={3} maxLength={5000} placeholder="Anything the team should know, e.g. where you met them" />
        </Cell>
      </FormSection>

      {isNew && (
        <FormSection title="Send the candidate form now" description="They fill in their address, education, experience and salary details from a personal link. Leave both unticked to send it later from their page.">
          <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2 lg:col-span-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={sendBy.email} onChange={(e) => setSendBy((v) => ({ ...v, email: e.target.checked }))} />
              By email
            </label>
            <label className={`inline-flex items-center gap-2 text-sm ${values.phone.trim() ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>
              <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={sendBy.whatsapp && Boolean(values.phone.trim())} disabled={!values.phone.trim()} onChange={(e) => setSendBy((v) => ({ ...v, whatsapp: e.target.checked }))} />
              By WhatsApp{!values.phone.trim() && ' (add a mobile number first)'}
            </label>
          </div>
        </FormSection>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end dark:border-[#2B293E]">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-[#2B293E] dark:hover:bg-white/5">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50">
          {saving ? 'Saving…' : candidate ? 'Save changes' : sendBy.email || (sendBy.whatsapp && values.phone.trim()) ? 'Add candidate and send form' : 'Add candidate'}
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

/** One titled group of fields on a responsive grid: one column on phones, two on tablets, three on wide screens. */
const FormSection: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[#2B293E] dark:bg-[#181724]">
    <legend className="sr-only">{title}</legend>
    <div className="mb-4">
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100" aria-hidden="true">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
    <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  </fieldset>
);

/** A label, its field and its message, aligned with the other cells in the row. */
const Cell: React.FC<{
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  extra?: React.ReactNode;
  span?: 'full';
  hideLabel?: boolean;
  children: React.ReactNode;
}> = ({ label, htmlFor, required, hint, error, extra, span, hideLabel, children }) => (
  <div className={`flex min-w-0 flex-col ${span === 'full' ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
    <div className={`mb-1 flex min-h-[1.25rem] items-center justify-between gap-2 ${hideLabel ? 'sr-only' : ''}`}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        {label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}
      </label>
      {extra}
    </div>
    {children}
    {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    {error}
  </div>
);
