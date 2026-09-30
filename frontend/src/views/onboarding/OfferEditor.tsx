import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { onboardingApi, type OfferDetail, type OfferInput, type OnboardingMeta, type TemplateSummary } from '../../api/onboarding.api';
import { toast } from '../../lib/toast';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { fieldClass, labelClass } from './onboarding-format';

interface Props {
  candidateId: string;
  candidateName: string;
  /** A draft being edited; omitted to draft a new offer. */
  offer?: OfferDetail;
  meta: OnboardingMeta | null;
  onCancel: () => void;
  onSaved: (offer: OfferDetail) => void;
}

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

/** The total of the pay lines, added in paise so it matches the server exactly. */
export function totalOf(amounts: string[]): string | null {
  let paise = 0n;
  for (const amount of amounts) {
    const value = amount.trim();
    if (!MONEY.test(value)) return null;
    const [whole, fraction = ''] = value.split('.');
    paise += BigInt(whole + fraction.padEnd(2, '0'));
  }
  const text = paise.toString().padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

const inr = (amount: string) => {
  const [whole, fraction] = amount.split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${rest ? `${rest},${last3}` : last3}.${fraction}`;
};

/** Drafting an offer, or editing a draft. It can be changed until it is sent for approval. */
export const OfferEditor: React.FC<Props> = ({ candidateId, candidateName, offer, meta, onCancel, onSaved }) => {
  const ids = useId();
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [values, setValues] = useState({
    templateVersionId: offer?.templateVersionId ?? '',
    jobTitle: offer?.jobTitle ?? '',
    departmentId: offer?.departmentId ?? '',
    designationId: offer?.designationId ?? '',
    employmentTypeId: offer?.employmentTypeId ?? '',
    workLocation: offer?.workLocation ?? '',
    probationMonths: offer?.probationMonths != null ? String(offer.probationMonths) : '',
    joiningDate: offer?.joiningDate ?? '',
    expiresOn: offer?.expiresOn ?? '',
    specialTerms: offer?.specialTerms ?? '',
  });
  const [components, setComponents] = useState(offer?.components.length ? offer.components : [{ label: 'Basic salary', annualAmount: '' }]);
  const [manager, setManager] = useState<{ id: string; name: string } | null>(offer?.reportingManagerEmployeeId ? { id: offer.reportingManagerEmployeeId, name: offer.reportingManagerName ?? 'Chosen manager' } : null);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerOptions, setManagerOptions] = useState<{ id: string; code: string; name: string }[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ArrayBuffer | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    onboardingApi
      .listTemplates('OFFER_LETTER')
      .then((rows) => setTemplates(rows.filter((t) => t.approvedVersion && !t.isArchived)))
      .catch((e: Error) => setTemplatesError(e.message));
  }, []);

  useEffect(() => {
    if (!managerSearch.trim()) return setManagerOptions([]);
    const timer = window.setTimeout(() => {
      onboardingApi.searchEmployees(managerSearch.trim()).then(setManagerOptions).catch(() => setManagerOptions([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [managerSearch]);

  const total = totalOf(components.map((c) => c.annualAmount));
  const errors: string[] = [];
  if (!values.templateVersionId) errors.push('Choose an approved offer letter template.');
  if (!values.jobTitle.trim()) errors.push('Enter the job title.');
  if (components.some((c) => !c.label.trim())) errors.push('Give every pay line a name.');
  if (total === null) errors.push('Enter every pay amount per year, like 900000 or 900000.50, without commas.');
  if (!values.expiresOn) errors.push('Choose the last day to accept.');
  if (!values.joiningDate) errors.push('Choose the joining date.');
  if (values.joiningDate && values.expiresOn && values.joiningDate < values.expiresOn) errors.push('The joining date must be on or after the last day to accept.');
  if (values.probationMonths && (!/^\d+$/.test(values.probationMonths) || Number(values.probationMonths) > 24)) errors.push('Probation must be 0 to 24 months.');

  const set = (name: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [name]: e.target.value }));

  const input = (): OfferInput => ({
      templateVersionId: values.templateVersionId,
      jobTitle: values.jobTitle.trim(),
      components: components.map((c) => ({ label: c.label.trim(), annualAmount: c.annualAmount.trim() })),
      joiningDate: values.joiningDate,
      expiresOn: values.expiresOn,
      ...(values.departmentId ? { departmentId: values.departmentId } : {}),
      ...(values.designationId ? { designationId: values.designationId } : {}),
      ...(values.employmentTypeId ? { employmentTypeId: values.employmentTypeId } : {}),
      ...(manager ? { reportingManagerEmployeeId: manager.id } : {}),
      ...(values.workLocation.trim() ? { workLocation: values.workLocation.trim() } : {}),
      ...(values.probationMonths ? { probationMonths: Number(values.probationMonths) } : {}),
      ...(values.specialTerms.trim() ? { specialTerms: values.specialTerms.trim() } : {}),
  });

  /** The letter as the form stands now, saved or not, shown in the viewer; the form keeps everything entered. */
  const showPreview = async () => {
    if (inFlight.current) return;
    setShowErrors(true);
    setServerError(null);
    if (errors.length) return;
    inFlight.current = true;
    setPreviewing(true);
    try {
      setPreview(await onboardingApi.previewOfferPdf(candidateId, input()));
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'The preview could not be made.');
    } finally {
      inFlight.current = false;
      setPreviewing(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setShowErrors(true);
    setServerError(null);
    if (errors.length) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const saved = offer ? await onboardingApi.updateOffer(offer.id, input()) : await onboardingApi.createOffer(candidateId, input());
      toast.success(offer ? 'Offer saved' : `Offer ${saved.offerCode} drafted`);
      onSaved(saved);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'The offer could not be saved.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate className="space-y-5 max-w-4xl" aria-labelledby={`${ids}-title`}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} aria-label="Back" className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <div>
          <h1 id={`${ids}-title`} className="text-xl font-bold text-slate-900 dark:text-slate-100">{offer ? `Edit offer ${offer.offerCode}` : `Offer for ${candidateName}`}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Saved as a draft. The letter is fixed when you send it for approval.</p>
        </div>
      </div>

      {(serverError || (showErrors && errors.length > 0)) && (
        <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800 space-y-1">
          {serverError && <p className="font-semibold">{serverError}</p>}
          {showErrors && errors.length > 0 && <ul className="list-disc list-inside">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}

      <fieldset className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] grid grid-cols-1 sm:grid-cols-2 gap-4">
        <legend className="px-1 text-sm font-bold text-slate-900 dark:text-slate-100">Role</legend>
        <div className="sm:col-span-2">
          <label htmlFor={`${ids}-template`} className={labelClass}>Offer letter template *</label>
          <select id={`${ids}-template`} value={values.templateVersionId} onChange={set('templateVersionId')} className={fieldClass}>
            <option value="">{templates === null ? 'Loading…' : templates.length === 0 ? 'No approved offer letter template yet' : 'Choose a template'}</option>
            {templates?.map((t) => <option key={t.approvedVersion!.id} value={t.approvedVersion!.id}>{t.name} (version {t.approvedVersion!.number})</option>)}
          </select>
          {templatesError && <p className="mt-1 text-xs text-red-700">The templates could not be loaded: {templatesError}</p>}
          {templates?.length === 0 && <p className="mt-1 text-xs text-slate-500">Create and approve one under Onboarding → Templates first.</p>}
        </div>
        <div><label htmlFor={`${ids}-job`} className={labelClass}>Job title *</label><input id={`${ids}-job`} value={values.jobTitle} onChange={set('jobTitle')} maxLength={160} className={fieldClass} /></div>
        <div><label htmlFor={`${ids}-location`} className={labelClass}>Work location</label><input id={`${ids}-location`} value={values.workLocation} onChange={set('workLocation')} maxLength={200} className={fieldClass} /></div>
        <div>
          <label htmlFor={`${ids}-department`} className={labelClass}>Department</label>
          <select id={`${ids}-department`} value={values.departmentId} onChange={set('departmentId')} className={fieldClass}><option value="">None</option>{meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </div>
        <div>
          <label htmlFor={`${ids}-designation`} className={labelClass}>Designation</label>
          <select id={`${ids}-designation`} value={values.designationId} onChange={set('designationId')} className={fieldClass}><option value="">None</option>{meta?.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </div>
        <div>
          <label htmlFor={`${ids}-type`} className={labelClass}>Employment type</label>
          <select id={`${ids}-type`} value={values.employmentTypeId} onChange={set('employmentTypeId')} className={fieldClass}><option value="">None</option>{meta?.employmentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        <div>
          <label htmlFor={`${ids}-manager`} className={labelClass}>Reporting manager</label>
          {manager ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-[#2B293E] text-sm">
              <span className="truncate">{manager.name}</span>
              <button type="button" onClick={() => setManager(null)} className="text-xs font-semibold text-teal-700 underline">Change</button>
            </div>
          ) : (
            <>
              <input id={`${ids}-manager`} type="search" value={managerSearch} onChange={(e) => setManagerSearch(e.target.value)} placeholder="Search employees by name or code" className={fieldClass} />
              {managerOptions.length > 0 && (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-[#2B293E]">
                  {managerOptions.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => { setManager(m); setManagerSearch(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                        {m.name} <span className="text-xs text-slate-500">{m.code}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] space-y-3">
        <legend className="px-1 text-sm font-bold text-slate-900 dark:text-slate-100">Pay per year</legend>
        <ol className="space-y-2">
          {components.map((component, index) => (
            <li key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_12rem_auto] gap-2 items-end">
              <div>
                <label htmlFor={`${ids}-label-${index}`} className={labelClass}>Line {index + 1} name *</label>
                <input id={`${ids}-label-${index}`} value={component.label} maxLength={120} onChange={(e) => setComponents((all) => all.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))} className={fieldClass} />
              </div>
              <div>
                <label htmlFor={`${ids}-amount-${index}`} className={labelClass}>Amount (₹ per year) *</label>
                <input id={`${ids}-amount-${index}`} inputMode="decimal" value={component.annualAmount} onChange={(e) => setComponents((all) => all.map((c, i) => (i === index ? { ...c, annualAmount: e.target.value } : c)))} className={`${fieldClass} text-right`} />
              </div>
              <button type="button" disabled={components.length === 1} onClick={() => setComponents((all) => all.filter((_, i) => i !== index))} aria-label={`Remove line ${index + 1}`} className="p-2 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-30">
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={components.length >= 20} onClick={() => setComponents((all) => [...all, { label: '', annualAmount: '' }])} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-dashed border-slate-300">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add pay line
          </button>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums" data-offer-total>Total (CTC): {total === null ? '—' : inr(total)}</p>
        </div>
      </fieldset>

      <fieldset className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] grid grid-cols-1 sm:grid-cols-3 gap-4">
        <legend className="px-1 text-sm font-bold text-slate-900 dark:text-slate-100">Dates and terms</legend>
        <div><label htmlFor={`${ids}-expires`} className={labelClass}>Last day to accept *</label><input id={`${ids}-expires`} type="date" value={values.expiresOn} onChange={set('expiresOn')} className={fieldClass} /></div>
        <div><label htmlFor={`${ids}-joining`} className={labelClass}>Joining date *</label><input id={`${ids}-joining`} type="date" value={values.joiningDate} onChange={set('joiningDate')} className={fieldClass} /></div>
        <div><label htmlFor={`${ids}-probation`} className={labelClass}>Probation (months)</label><input id={`${ids}-probation`} inputMode="numeric" value={values.probationMonths} onChange={set('probationMonths')} className={fieldClass} /></div>
        <div className="sm:col-span-3"><label htmlFor={`${ids}-terms`} className={labelClass}>Special terms</label><textarea id={`${ids}-terms`} rows={3} value={values.specialTerms} onChange={set('specialTerms')} maxLength={5000} className={fieldClass} /></div>
      </fieldset>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-[#2B293E]">Cancel</button>
        <button type="button" onClick={showPreview} disabled={saving || previewing} className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-[#2B293E] disabled:opacity-50">{previewing ? 'Preparing preview…' : 'Preview letter'}</button>
        <button type="submit" disabled={saving || previewing} className="px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button>
      </div>
      {preview && (
        <PdfViewer
          title={offer ? `Preview: offer ${offer.offerCode}` : `Preview: offer for ${candidateName}`}
          description="The letter as this form stands, including changes not yet saved"
          notice="Preview only: nothing is saved, approved or sent. Close it to keep editing."
          load={() => Promise.resolve(preview)}
          downloadName="offer-preview.pdf"
          onClose={() => setPreview(null)}
        />
      )}
    </form>
  );
};
