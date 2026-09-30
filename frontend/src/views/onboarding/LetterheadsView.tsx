import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { PdfViewer } from '../../components/ui/PdfViewer';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { MAX_LETTERHEAD_IMAGE_BYTES, onboardingApi, type Letterhead, type LetterheadImageSlot, type LetterheadInput } from '../../api/onboarding.api';
import { fieldClass, labelClass } from './onboarding-format';

const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50';
const primaryClass = 'px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50';

const SLOTS: { slot: LetterheadImageSlot; label: string; hint: string }[] = [
  { slot: 'logo', label: 'Logo', hint: 'Shown beside or above the company details. A transparent PNG looks best.' },
  { slot: 'header', label: 'Header artwork', hint: 'A ready-made letterhead banner. Replaces the logo and details at the top of each page.' },
  { slot: 'footer', label: 'Footer artwork', hint: 'Replaces the footer text at the bottom of each page.' },
];

/** Why an image would be refused, before sending it; the server checks it again, by content. */
export function imageProblem(file: File): string | null {
  if (!['image/png', 'image/jpeg'].includes(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) return 'Choose a PNG or JPEG image.';
  if (file.size === 0) return 'That image is empty.';
  if (file.size > MAX_LETTERHEAD_IMAGE_BYTES) return 'That image is larger than 2 MB. Upload a smaller copy.';
  return null;
}

/** Company letterheads used by document templates. */
export const LetterheadsView: React.FC = () => {
  const { can } = useAuth();
  const [rows, setRows] = useState<Letterhead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Letterhead | 'new' | null>(null);

  const load = useCallback(() => {
    setError(null);
    onboardingApi.listLetterheads().then(setRows).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (open) return <LetterheadEditor letterhead={open === 'new' ? null : open} onBack={() => { setOpen(null); load(); }} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          A letterhead puts your company’s logo and details on generated documents. Each template chooses its letterhead. Letters already sent keep the letterhead they were sent with.
        </p>
        {can('onboarding.templates.approve') && <button type="button" onClick={() => setOpen('new')} className={`${primaryClass} whitespace-nowrap`}>New letterhead</button>}
      </div>
      {error ? (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The letterheads could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      ) : rows === null ? (
        <div className="h-32 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading letterheads</span></div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-[#2B293E]">
          <p className="font-semibold text-slate-800 dark:text-slate-200">No letterheads yet</p>
          <p className="mt-1 text-sm text-slate-500">Until you add one, documents show your company name at the top of a plain page.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setOpen(l)} className="w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] hover:border-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                <span className="block font-semibold text-slate-900 dark:text-slate-100 break-words">{l.name}</span>
                <span className="block text-xs text-slate-500 break-words">{l.companyName}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {l.isDefault && <Badge variant="success" size="sm">Default</Badge>}
                  {l.isArchived && <Badge variant="neutral" size="sm">Archived</Badge>}
                  <Badge variant="neutral" size="sm">{l.images.header ? 'Header artwork' : l.images.logo ? 'Logo' : 'No logo'}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const toInput = (l: Letterhead | null): Record<keyof LetterheadInput, string | number | boolean> => ({
  name: l?.name ?? 'Official letterhead',
  companyName: l?.companyName ?? '',
  addressText: l?.addressText ?? '',
  phone: l?.phone ?? '',
  email: l?.email ?? '',
  website: l?.website ?? '',
  registrationText: l?.registrationText ?? '',
  footerText: l?.footerText ?? '',
  logoPosition: l?.logoPosition ?? 'LEFT',
  headerHeightMm: l?.headerHeightMm ?? 30,
  footerHeightMm: l?.footerHeightMm ?? 16,
  isDefault: l?.isDefault ?? false,
});

const LetterheadEditor: React.FC<{ letterhead: Letterhead | null; onBack: () => void }> = ({ letterhead, onBack }) => {
  const ids = useId();
  const { can } = useAuth();
  const [saved, setSaved] = useState<Letterhead | null>(letterhead);
  const [values, setValues] = useState(toInput(letterhead));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ArrayBuffer | null>(null);
  const canEdit = can('onboarding.templates.approve') && !saved?.isArchived;

  const set = (name: keyof LetterheadInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  const input = (): LetterheadInput => {
    const text = (key: keyof LetterheadInput) => String(values[key]).trim() || undefined;
    return {
      name: String(values.name).trim(),
      companyName: String(values.companyName).trim(),
      addressText: text('addressText'),
      phone: text('phone'),
      email: text('email'),
      website: text('website'),
      registrationText: text('registrationText'),
      footerText: text('footerText'),
      logoPosition: values.logoPosition as LetterheadInput['logoPosition'],
      headerHeightMm: Number(values.headerHeightMm),
      footerHeightMm: Number(values.footerHeightMm),
      isDefault: Boolean(values.isDefault),
    };
  };
  const problem = () => {
    const i = input();
    if (!i.name) return 'Enter a name for the letterhead.';
    if (!i.companyName) return 'Enter the company name.';
    if (!(i.headerHeightMm >= 15 && i.headerHeightMm <= 70)) return 'The header is between 15 and 70 mm tall.';
    if (!(i.footerHeightMm >= 8 && i.footerHeightMm <= 50)) return 'The footer is between 8 and 50 mm tall.';
    return null;
  };

  const act = async (run: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const refused = problem();
    if (refused) return setError(refused);
    act(async () => {
      const result = saved ? await onboardingApi.updateLetterhead(saved.id, input()) : await onboardingApi.createLetterhead(input());
      setSaved(result);
      setValues(toInput(result));
      toast.success(saved ? 'Letterhead saved' : 'Letterhead created. You can add images now.');
    });
  };

  const showPreview = () => {
    const refused = problem();
    if (refused) return setError(refused);
    act(async () => setPreview(await onboardingApi.previewLetterheadPdf(input(), saved?.id)));
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} aria-label="Back to letterheads" className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10"><ArrowLeft className="w-4 h-4" aria-hidden="true" /></button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 break-words">{saved ? saved.name : 'New letterhead'}</h2>
            <p className="text-xs text-slate-500">{saved?.isArchived ? 'Archived: templates that use it keep it; it can’t be chosen for others.' : 'Changes show on documents generated from now on.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('onboarding.templates.manage') && <button type="button" disabled={busy} onClick={showPreview} className={actionClass}>Preview on a sample letter</button>}
          {saved && can('onboarding.templates.approve') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(async () => { const r = await onboardingApi.archiveLetterhead(saved.id, !saved.isArchived); setSaved(r); setValues(toInput(r)); toast.success(r.isArchived ? 'Letterhead archived' : 'Letterhead restored'); })}
              className={actionClass}
            >
              {saved.isArchived ? 'Restore' : 'Archive'}
            </button>
          )}
          {canEdit && <button type="button" disabled={busy} onClick={save} className={primaryClass}>{busy ? 'Saving…' : saved ? 'Save letterhead' : 'Create letterhead'}</button>}
        </div>
      </div>
      {error && <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}

      <section aria-labelledby={`${ids}-details`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] space-y-3">
        <h3 id={`${ids}-details`} className="text-sm font-bold">Company details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id={`${ids}-name`} label="Letterhead name *"><input id={`${ids}-name`} value={String(values.name)} onChange={set('name')} readOnly={!canEdit} maxLength={120} className={fieldClass} /></Field>
          <Field id={`${ids}-company`} label="Company name *"><input id={`${ids}-company`} value={String(values.companyName)} onChange={set('companyName')} readOnly={!canEdit} maxLength={200} className={fieldClass} /></Field>
          <div className="sm:col-span-2">
            <Field id={`${ids}-address`} label="Registered or office address"><textarea id={`${ids}-address`} rows={2} value={String(values.addressText)} onChange={set('addressText')} readOnly={!canEdit} maxLength={500} className={fieldClass} /></Field>
          </div>
          <Field id={`${ids}-phone`} label="Phone"><input id={`${ids}-phone`} value={String(values.phone)} onChange={set('phone')} readOnly={!canEdit} maxLength={64} className={fieldClass} /></Field>
          <Field id={`${ids}-email`} label="Email"><input id={`${ids}-email`} type="email" value={String(values.email)} onChange={set('email')} readOnly={!canEdit} maxLength={320} className={fieldClass} /></Field>
          <Field id={`${ids}-website`} label="Website"><input id={`${ids}-website`} value={String(values.website)} onChange={set('website')} readOnly={!canEdit} maxLength={200} className={fieldClass} /></Field>
          <Field id={`${ids}-registration`} label="Registration details" hint="For example CIN, GSTIN or PAN. Printed in the footer.">
            <input id={`${ids}-registration`} value={String(values.registrationText)} onChange={set('registrationText')} readOnly={!canEdit} maxLength={300} className={fieldClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field id={`${ids}-footer`} label="Footer text"><input id={`${ids}-footer`} value={String(values.footerText)} onChange={set('footerText')} readOnly={!canEdit} maxLength={500} className={fieldClass} /></Field>
          </div>
        </div>
      </section>

      <section aria-labelledby={`${ids}-layout`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] space-y-3">
        <h3 id={`${ids}-layout`} className="text-sm font-bold">Layout</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field id={`${ids}-position`} label="Logo position">
            <select id={`${ids}-position`} value={String(values.logoPosition)} onChange={set('logoPosition')} disabled={!canEdit} className={fieldClass}>
              <option value="LEFT">Left, details on the right</option>
              <option value="RIGHT">Right, details on the left</option>
              <option value="CENTER">Centred above the details</option>
            </select>
          </Field>
          <Field id={`${ids}-header-height`} label="Header height (mm)" hint="15 to 70">
            <input id={`${ids}-header-height`} type="number" min={15} max={70} value={Number(values.headerHeightMm)} onChange={set('headerHeightMm')} readOnly={!canEdit} className={fieldClass} />
          </Field>
          <Field id={`${ids}-footer-height`} label="Footer height (mm)" hint="8 to 50">
            <input id={`${ids}-footer-height`} type="number" min={8} max={50} value={Number(values.footerHeightMm)} onChange={set('footerHeightMm')} readOnly={!canEdit} className={fieldClass} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(values.isDefault)} onChange={set('isDefault')} disabled={!canEdit} />
          Use as the default for new templates
        </label>
      </section>

      <section aria-labelledby={`${ids}-images`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] space-y-3">
        <div>
          <h3 id={`${ids}-images`} className="text-sm font-bold">Images</h3>
          <p className="text-xs text-slate-500">PNG or JPEG, up to 2 MB each. Images keep their proportions on the page.</p>
        </div>
        {!saved ? (
          <p className="text-sm text-slate-500">Create the letterhead first, then add its logo or artwork.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SLOTS.map((s) => (
              <li key={s.slot}>
                <ImageSlot letterhead={saved} slot={s.slot} label={s.label} hint={s.hint} canEdit={canEdit} onChanged={(l) => setSaved(l)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {preview && (
        <PdfViewer
          title={`Sample: ${String(values.name) || 'letterhead'}`}
          description="A made-up letter on this letterhead, including changes not yet saved"
          notice="Sample preview: made-up data, not a real document. Nothing is saved. Close it to keep editing."
          load={() => Promise.resolve(preview)}
          downloadName="letterhead-sample.pdf"
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
};

const Field: React.FC<{ id: string; label: string; hint?: string; children: React.ReactNode }> = ({ id, label, hint, children }) => (
  <div>
    <label htmlFor={id} className={labelClass}>{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
);

/** One of the letterhead's images: shown through the authenticated API, uploaded or removed here. */
const ImageSlot: React.FC<{ letterhead: Letterhead; slot: LetterheadImageSlot; label: string; hint: string; canEdit: boolean; onChanged: (l: Letterhead) => void }> = ({
  letterhead,
  slot,
  label,
  hint,
  canEdit,
  onChanged,
}) => {
  const present = letterhead.images[slot];
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const created = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!present) return;
    onboardingApi
      .letterheadImage(letterhead.id, slot)
      .then((bytes) => {
        if (cancelled) return;
        created.current = URL.createObjectURL(new Blob([bytes]));
        setUrl(created.current);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      if (created.current) URL.revokeObjectURL(created.current);
      created.current = null;
    };
  }, [letterhead.id, letterhead.updatedAt, slot, present]);

  const change = async (run: () => Promise<Letterhead>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await run());
      toast.success(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E] h-full flex flex-col gap-2">
      <p className="text-sm font-semibold">{label}</p>
      <div className="h-24 rounded-lg bg-slate-50 dark:bg-[#1E1D2D] border border-dashed border-slate-200 dark:border-[#2B293E] flex items-center justify-center overflow-hidden">
        {url ? <img src={url} alt={`${label} of ${letterhead.name}`} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-500">{present ? 'Loading…' : 'None'}</span>}
      </div>
      <p className="text-xs text-slate-500">{hint}</p>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2 mt-auto">
          <label className={`${actionClass} cursor-pointer focus-within:ring-2 focus-within:ring-teal-500 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy ? 'Working…' : present ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              disabled={busy}
              aria-label={`${present ? 'Replace' : 'Upload'} ${label.toLowerCase()}`}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const refused = imageProblem(file);
                if (refused) return setError(refused);
                change(() => onboardingApi.uploadLetterheadImage(letterhead.id, slot, file), `${label} uploaded`);
              }}
            />
          </label>
          {present && (
            <button type="button" disabled={busy} onClick={() => change(() => onboardingApi.removeLetterheadImage(letterhead.id, slot), `${label} removed`)} className={actionClass}>
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
};
