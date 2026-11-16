import React, { useEffect, useId, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FormAddress, FormEducation, FormExperience, FormReference } from '../../api/onboarding.api';
import {
  FormLinkError,
  publicCandidateFormApi,
  type CandidateFormSubmission,
  type FormDocument,
  type PublicCandidateForm,
} from '../../api/public-candidate-form.api';
import { COUNTRY_CODES } from '../../lib/countryCodes';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 aria-[invalid=true]:border-red-500';
const label = 'mb-1 block text-xs font-semibold text-slate-700';
const COUNTRIES = [...new Map(COUNTRY_CODES.map((c) => [c.iso, c.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
const MAX_EDUCATION = 10;
const MAX_EXPERIENCE = 15;
const MAX_REFERENCES = 5;

const emptyAddress = (): FormAddress => ({ addressLine1: '', addressLine2: '', city: '', stateRegion: '', postalCode: '', countryCode: 'IN' });
const emptyEducation = (): FormEducation => ({ qualification: '', institution: '', university: '', passingYear: null, score: '' });
const emptyExperience = (): FormExperience => ({ companyName: '', designation: '', startDate: '', endDate: '', isCurrent: false, lastSalary: '', responsibilities: '' });
const emptyReference = (): FormReference => ({ name: '', relationship: '', companyName: '', phone: '', email: '' });

/** Optional text is sent only when filled in. */
const opt = (value: string | null | undefined) => (value && value.trim() ? value.trim() : undefined);
const cleanAddress = (a: FormAddress): FormAddress => ({
  addressLine1: a.addressLine1.trim(), addressLine2: opt(a.addressLine2), city: a.city.trim(), stateRegion: opt(a.stateRegion), postalCode: opt(a.postalCode), countryCode: a.countryCode,
});

/**
 * The candidate's information form, opened from their emailed link without
 * signing in. It is filled in from any earlier answers, checked here for
 * clear messages, checked again by the server, and submitted once.
 */
export const PublicCandidateFormView: React.FC<{ token: string }> = ({ token }) => {
  const ids = useId();
  const [form, setForm] = useState<PublicCandidateForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);

  const [personal, setPersonal] = useState({ fullName: '', dateOfBirth: '', genderCode: '', phone: '', alternatePhone: '' });
  const [current, setCurrent] = useState<FormAddress>(emptyAddress);
  const [hasPermanent, setHasPermanent] = useState(false);
  const [permanent, setPermanent] = useState<FormAddress>(emptyAddress);
  const [education, setEducation] = useState<FormEducation[]>([emptyEducation()]);
  const [experience, setExperience] = useState<FormExperience[]>([]);
  const [work, setWork] = useState({ totalExperienceYears: '', expectedSalary: '', noticePeriodDays: '', lastWorkingDate: '', skills: '' });
  const [emergency, setEmergency] = useState({ name: '', relationship: '', phone: '' });
  const [references, setReferences] = useState<FormReference[]>([]);
  const [additional, setAdditional] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    // The link carries the token: keep it out of requests to other sites.
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    document.title = 'Your details';
    publicCandidateFormApi.get(token)
      .then((loaded) => {
        setForm(loaded);
        const d = loaded.details;
        setPersonal({ fullName: d.fullName, dateOfBirth: d.dateOfBirth ?? '', genderCode: d.genderCode ?? '', phone: d.phone ?? '', alternatePhone: d.alternatePhone ?? '' });
        if (d.currentAddress) setCurrent({ ...emptyAddress(), ...d.currentAddress });
        if (d.permanentAddress) { setHasPermanent(true); setPermanent({ ...emptyAddress(), ...d.permanentAddress }); }
        if (d.education.length) setEducation(d.education);
        setExperience(d.experience);
        setWork({
          totalExperienceYears: d.totalExperienceYears ?? '', expectedSalary: d.expectedSalary ?? '',
          noticePeriodDays: d.noticePeriodDays?.toString() ?? '', lastWorkingDate: d.lastWorkingDate ?? '', skills: d.skills ?? '',
        });
        setEmergency({ name: d.emergencyContactName ?? '', relationship: d.emergencyContactRelationship ?? '', phone: d.emergencyContactPhone ?? '' });
        setReferences(d.references);
        setAdditional(d.additionalInformation ?? '');
      })
      .catch((e: Error) => setError(e.message));
    return () => meta.remove();
  }, [token]);

  /** The first problem, in the order the form reads, so the candidate can fix it. */
  const problem = (): string | null => {
    if (personal.fullName.trim().length < 2) return 'Enter your full name.';
    if (!personal.dateOfBirth) return 'Enter your date of birth.';
    if (!personal.phone.trim()) return 'Enter your mobile number.';
    if (!current.addressLine1.trim() || !current.city.trim()) return 'Enter your current address and city.';
    if (hasPermanent && (!permanent.addressLine1.trim() || !permanent.city.trim())) return 'Enter your permanent address and city, or untick the separate permanent address.';
    if (education.some((e) => !e.qualification.trim() || !e.institution.trim())) return 'Each education entry needs a qualification and an institution.';
    if (experience.some((x) => !x.companyName.trim() || !x.designation.trim())) return 'Each job needs a company and a designation.';
    if (experience.some((x) => !x.isCurrent && x.startDate && x.endDate && x.endDate < x.startDate)) return 'A job’s end date is before its start date.';
    if (!emergency.name.trim() || !emergency.phone.trim()) return 'Enter an emergency contact’s name and phone number.';
    if (references.some((r) => !r.name.trim() || (!r.phone?.trim() && !r.email?.trim()))) return 'Each reference needs a name and a phone number or email.';
    if (!confirmed) return 'Confirm that your details are correct.';
    return null;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const found = problem();
    if (found) { setSubmitError(found); return; }
    inFlight.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    const body: CandidateFormSubmission = {
      fullName: personal.fullName.trim(),
      dateOfBirth: personal.dateOfBirth,
      genderCode: opt(personal.genderCode),
      phone: personal.phone.trim(),
      alternatePhone: opt(personal.alternatePhone),
      currentAddress: cleanAddress(current),
      permanentAddress: hasPermanent ? cleanAddress(permanent) : undefined,
      education: education.map((e) => ({ qualification: e.qualification.trim(), institution: e.institution.trim(), university: opt(e.university), passingYear: e.passingYear || undefined, score: opt(e.score) })),
      experience: experience.map((x) => ({
        companyName: x.companyName.trim(), designation: x.designation.trim(), startDate: opt(x.startDate), endDate: x.isCurrent ? undefined : opt(x.endDate),
        isCurrent: Boolean(x.isCurrent), lastSalary: opt(x.lastSalary), responsibilities: opt(x.responsibilities),
      })),
      totalExperienceYears: opt(work.totalExperienceYears),
      expectedSalary: opt(work.expectedSalary),
      noticePeriodDays: work.noticePeriodDays ? Number(work.noticePeriodDays) : undefined,
      lastWorkingDate: opt(work.lastWorkingDate),
      skills: opt(work.skills),
      emergencyContactName: emergency.name.trim(),
      emergencyContactRelationship: opt(emergency.relationship),
      emergencyContactPhone: emergency.phone.trim(),
      references: references.map((r) => ({ name: r.name.trim(), relationship: opt(r.relationship), companyName: opt(r.companyName), phone: opt(r.phone), email: opt(r.email) })),
      additionalInformation: opt(additional),
      confirmed: true,
    };
    try {
      await publicCandidateFormApi.submit(token, body);
      setSubmitted(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof FormLinkError && e.isClosed) setError(e.message);
      else setSubmitError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const update = <T,>(list: T[], set: (next: T[]) => void, index: number, change: Partial<T>) => set(list.map((item, i) => (i === index ? { ...item, ...change } : item)));

  if (error) {
    return (
      <Shell>
        <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-center">
          <h1 className="text-lg font-bold">This form can't be opened</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </Shell>
    );
  }
  if (!form) {
    return <Shell><div className="h-64 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading your form</span></div></Shell>;
  }
  if (submitted) {
    return (
      <Shell>
        <div role="status" className="rounded-2xl border border-teal-200 bg-white p-6 text-center">
          <h1 className="text-lg font-bold">Thank you, your details have been sent</h1>
          <p className="mt-2 text-sm text-slate-600">{form.companyName} will review them and contact you about the next steps. You can close this page.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header>
        <p className="text-sm font-semibold text-teal-700">{form.companyName}</p>
        <h1 className="text-2xl font-bold">Your details for the {form.position} role</h1>
        <p className="mt-1 text-sm text-slate-600">Fields marked * are required. This form can be submitted once, until {new Date(form.linkExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
      </header>
      {form.message && <p role="note" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>From {form.companyName}:</strong> {form.message}</p>}

      <form onSubmit={submit} noValidate className="space-y-5">
        <Section title="Personal information">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Full name" required value={personal.fullName} onChange={(v) => setPersonal({ ...personal, fullName: v })} autoComplete="name" />
            <Input label="Date of birth" required type="date" value={personal.dateOfBirth} onChange={(v) => setPersonal({ ...personal, dateOfBirth: v })} autoComplete="bday" />
            <Select label="Gender" value={personal.genderCode} onChange={(v) => setPersonal({ ...personal, genderCode: v })}
              options={[['', 'Prefer not to say'], ['MALE', 'Male'], ['FEMALE', 'Female'], ['OTHER', 'Other']]} />
            <div>
              <span className={label}>Email</span>
              <p className="py-2 text-sm text-slate-700">{form.details.email}</p>
            </div>
            <Input label="Mobile number" required type="tel" value={personal.phone} onChange={(v) => setPersonal({ ...personal, phone: v })} autoComplete="tel" />
            <Input label="Alternate number" type="tel" value={personal.alternatePhone} onChange={(v) => setPersonal({ ...personal, alternatePhone: v })} />
          </div>
          <AddressFields legend="Current address" required address={current} onChange={setCurrent} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={hasPermanent} onChange={(e) => setHasPermanent(e.target.checked)} />
            My permanent address is different
          </label>
          {hasPermanent && <AddressFields legend="Permanent address" required address={permanent} onChange={setPermanent} />}
        </Section>

        <Section title="Education">
          {education.map((e, i) => (
            <Entry key={i} title={`Qualification ${i + 1}`} onRemove={education.length > 1 ? () => setEducation(education.filter((_, j) => j !== i)) : undefined}>
              <Input label="Qualification" required value={e.qualification} onChange={(v) => update(education, setEducation, i, { qualification: v })} placeholder="e.g. B.Com" />
              <Input label="Institution" required value={e.institution} onChange={(v) => update(education, setEducation, i, { institution: v })} />
              <Input label="University" value={e.university ?? ''} onChange={(v) => update(education, setEducation, i, { university: v })} />
              <Input label="Passing year" type="number" value={e.passingYear?.toString() ?? ''} onChange={(v) => update(education, setEducation, i, { passingYear: v ? Number(v) : null })} />
              <Input label="Percentage or CGPA" value={e.score ?? ''} onChange={(v) => update(education, setEducation, i, { score: v })} placeholder="e.g. 72% or 8.1" />
            </Entry>
          ))}
          {education.length < MAX_EDUCATION && <AddButton onClick={() => setEducation([...education, emptyEducation()])}>Add qualification</AddButton>}
        </Section>

        <Section title="Professional information" description="Leave the job list empty if this is your first job.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Total experience (years)" inputMode="decimal" value={work.totalExperienceYears} onChange={(v) => setWork({ ...work, totalExperienceYears: v })} />
            <Input label="Expected salary (per year, ₹)" inputMode="decimal" value={work.expectedSalary} onChange={(v) => setWork({ ...work, expectedSalary: v })} />
            <Input label="Notice period (days)" inputMode="numeric" value={work.noticePeriodDays} onChange={(v) => setWork({ ...work, noticePeriodDays: v.replace(/\D/g, '') })} />
            <Input label="Last working date, if known" type="date" value={work.lastWorkingDate} onChange={(v) => setWork({ ...work, lastWorkingDate: v })} />
          </div>
          <Textarea label="Relevant skills" value={work.skills} onChange={(v) => setWork({ ...work, skills: v })} />
          {experience.map((x, i) => (
            <Entry key={i} title={`Job ${i + 1}`} onRemove={() => setExperience(experience.filter((_, j) => j !== i))}>
              <Input label="Company" required value={x.companyName} onChange={(v) => update(experience, setExperience, i, { companyName: v })} />
              <Input label="Designation" required value={x.designation} onChange={(v) => update(experience, setExperience, i, { designation: v })} />
              <Input label="From" type="date" value={x.startDate ?? ''} onChange={(v) => update(experience, setExperience, i, { startDate: v })} />
              {!x.isCurrent && <Input label="To" type="date" value={x.endDate ?? ''} onChange={(v) => update(experience, setExperience, i, { endDate: v })} />}
              <Input label="Last salary (per year, ₹)" inputMode="decimal" value={x.lastSalary ?? ''} onChange={(v) => update(experience, setExperience, i, { lastSalary: v })} />
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={Boolean(x.isCurrent)} onChange={(e) => update(experience, setExperience, i, { isCurrent: e.target.checked })} />
                I work here now
              </label>
            </Entry>
          ))}
          {experience.length < MAX_EXPERIENCE && <AddButton onClick={() => setExperience([...experience, emptyExperience()])}>Add job</AddButton>}
        </Section>

        <Section title="Emergency contact">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Name" required value={emergency.name} onChange={(v) => setEmergency({ ...emergency, name: v })} />
            <Input label="Relationship" value={emergency.relationship} onChange={(v) => setEmergency({ ...emergency, relationship: v })} placeholder="e.g. Spouse" />
            <Input label="Phone" required type="tel" value={emergency.phone} onChange={(v) => setEmergency({ ...emergency, phone: v })} />
          </div>
        </Section>

        <Section title="References" description="Optional, unless the company asked for them.">
          {references.map((r, i) => (
            <Entry key={i} title={`Reference ${i + 1}`} onRemove={() => setReferences(references.filter((_, j) => j !== i))}>
              <Input label="Name" required value={r.name} onChange={(v) => update(references, setReferences, i, { name: v })} />
              <Input label="How you know them" value={r.relationship ?? ''} onChange={(v) => update(references, setReferences, i, { relationship: v })} placeholder="e.g. Former manager" />
              <Input label="Company" value={r.companyName ?? ''} onChange={(v) => update(references, setReferences, i, { companyName: v })} />
              <Input label="Phone" type="tel" value={r.phone ?? ''} onChange={(v) => update(references, setReferences, i, { phone: v })} />
              <Input label="Email" type="email" value={r.email ?? ''} onChange={(v) => update(references, setReferences, i, { email: v })} />
            </Entry>
          ))}
          {references.length < MAX_REFERENCES && <AddButton onClick={() => setReferences([...references, emptyReference()])}>Add reference</AddButton>}
        </Section>

        {form.documents?.length > 0 && (
          <Section title="Documents" description="PDF, JPG or PNG, up to 10 MB each. Each upload is saved straight away.">
            <ul className="divide-y divide-slate-100">
              {form.documents.map((d) => (
                <DocumentRow key={d.id} token={token} document={d} onUploaded={(documents) => setForm({ ...form, documents })} />
              ))}
            </ul>
          </Section>
        )}

        <Section title="Anything else">
          <Textarea label="Other information you'd like to share" value={additional} onChange={setAdditional} />
        </Section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          {submitError && <p id={`${ids}-error`} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{submitError}</p>}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-600" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I confirm that the details I've given are correct and complete.
          </label>
          <button type="submit" disabled={isSubmitting} aria-describedby={submitError ? `${ids}-error` : undefined}
            className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-60">
            {isSubmitting ? 'Sending…' : 'Submit my details'}
          </button>
        </section>
      </form>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900"><div className="mx-auto max-w-3xl space-y-5">{children}</div></main>
);

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div>
      <h2 className="font-bold">{title}</h2>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    {children}
  </section>
);

const Entry: React.FC<{ title: string; onRemove?: () => void; children: React.ReactNode }> = ({ title, onRemove, children }) => (
  <fieldset className="rounded-xl border border-slate-200 p-4">
    <legend className="px-1 text-sm font-semibold text-slate-700">{title}</legend>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    {onRemove && (
      <button type="button" onClick={onRemove} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline">
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove {title.toLowerCase()}
      </button>
    )}
  </fieldset>
);

const AddButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">
    <Plus className="h-4 w-4" aria-hidden="true" /> {children}
  </button>
);

const Input: React.FC<{
  label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; placeholder?: string;
  autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}> = ({ label: text, value, onChange, required, type = 'text', placeholder, autoComplete, inputMode }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={label}>{text}{required && <span aria-hidden="true" className="text-red-600"> *</span>}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder}
        autoComplete={autoComplete} inputMode={inputMode} className={field} maxLength={type === 'text' ? 200 : undefined} />
    </div>
  );
};

const Textarea: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label: text, value, onChange }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <textarea id={id} rows={3} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} className={field} />
    </div>
  );
};

const Select: React.FC<{ label: string; value: string; onChange: (value: string) => void; options: [string, string][] }> = ({ label: text, value, onChange, options }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        {options.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
      </select>
    </div>
  );
};

const AddressFields: React.FC<{ legend: string; required?: boolean; address: FormAddress; onChange: (a: FormAddress) => void }> = ({ legend, required, address, onChange }) => (
  <fieldset className="rounded-xl border border-slate-200 p-4">
    <legend className="px-1 text-sm font-semibold text-slate-700">{legend}</legend>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input label="Address line 1" required={required} value={address.addressLine1} onChange={(v) => onChange({ ...address, addressLine1: v })} autoComplete="address-line1" />
      <Input label="Address line 2" value={address.addressLine2 ?? ''} onChange={(v) => onChange({ ...address, addressLine2: v })} autoComplete="address-line2" />
      <Input label="City" required={required} value={address.city} onChange={(v) => onChange({ ...address, city: v })} autoComplete="address-level2" />
      <Input label="State" value={address.stateRegion ?? ''} onChange={(v) => onChange({ ...address, stateRegion: v })} autoComplete="address-level1" />
      <Input label="PIN / postal code" value={address.postalCode ?? ''} onChange={(v) => onChange({ ...address, postalCode: v })} autoComplete="postal-code" />
      <Select label="Country" value={address.countryCode} onChange={(v) => onChange({ ...address, countryCode: v })} options={COUNTRIES} />
    </div>
  </fieldset>
);

const DOCUMENT_STATE: Record<FormDocument['state'], string> = {
  MISSING: 'Not uploaded',
  INCOMPLETE: 'More files needed',
  PENDING_REVIEW: 'Uploaded',
  PARTIALLY_VERIFIED: 'Uploaded',
  VERIFIED: 'Accepted',
  REJECTED: 'Please upload again',
};

/** One requested document: its state, the files already sent, and an upload button. */
const DocumentRow: React.FC<{ token: string; document: FormDocument; onUploaded: (documents: FormDocument[]) => void }> = ({ token, document: d, onUploaded }) => {
  const id = useId();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const rejected = d.files.find((f) => f.reviewStatus === 'REJECTED' && f.rejectionReason);
  const canUpload = d.state !== 'VERIFIED' && d.state !== 'PARTIALLY_VERIFIED';

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      onUploaded(await publicCandidateFormApi.upload(token, d.id, [...files]));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'The file could not be uploaded. Try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{d.label}{d.isRequired ? <span className="text-red-600" aria-hidden="true"> *</span> : <span className="font-normal text-slate-500"> (optional)</span>}</p>
        <p className="text-xs text-slate-600">
          {DOCUMENT_STATE[d.state]}
          {d.files.length > 0 && ` · ${d.files.map((f) => f.filename).join(', ')}`}
          {d.slots?.length ? ` · needs: ${d.slots.join(', ')}` : d.maxFiles > 1 ? ` · up to ${d.maxFiles} files` : ''}
        </p>
        {rejected && <p className="text-xs text-red-700">Reason: {rejected.rejectionReason}</p>}
        {uploadError && <p role="alert" className="text-xs text-red-700">{uploadError}</p>}
      </div>
      {canUpload && (
        <label htmlFor={id} className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 focus-within:ring-2 focus-within:ring-teal-500 ${isUploading ? 'pointer-events-none opacity-50' : ''}`}>
          {isUploading ? 'Uploading…' : d.files.length ? 'Upload again' : 'Upload'}
          <span className="sr-only"> {d.label}</span>
          <input id={id} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" multiple={d.maxFiles > 1} disabled={isUploading}
            onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
        </label>
      )}
    </li>
  );
};
