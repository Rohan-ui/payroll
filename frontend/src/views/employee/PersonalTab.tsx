import React, { useState } from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../lib/toast';
import { COUNTRY_CODES } from '../../lib/countryCodes';
import {
  employeeProfileApi,
  type Address,
  type EmergencyContact,
  type EmployeeProfile,
  type PersonalDetails,
  type PersonalInput,
} from '../../api/employee-profile.api';
import { day, errorText, fieldClass } from '../payroll/payroll-format';
import { EditButton, Facts, Field, FormDialog, Section, orNull } from './profile-ui';

const GENDERS: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other', UNDISCLOSED: 'Prefers not to say' };
const MARITAL: Record<string, string> = { SINGLE: 'Single', MARRIED: 'Married', DIVORCED: 'Divorced', WIDOWED: 'Widowed', SEPARATED: 'Separated' };
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COUNTRIES = [...new Map(COUNTRY_CODES.map((c) => [c.iso, c.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
const countryName = (iso: string | null) => (iso ? COUNTRIES.find(([code]) => code === iso)?.[1] ?? iso : null);

interface Props {
  profile: EmployeeProfile;
  canEdit: boolean;
  onSaved: (profile: EmployeeProfile) => void;
  /** Open the personal details form straight away (Edit from the People list). */
  startEditing?: boolean;
}

/** Personal and contact details, addresses and emergency contacts. */
export const PersonalTab: React.FC<Props> = ({ profile, canEdit, onSaved, startEditing }) => {
  const [editing, setEditing] = useState<'personal' | 'contact' | Address['type'] | null>(startEditing ? 'personal' : null);
  const [contact, setContact] = useState<EmergencyContact | 'new' | null>(null);
  const [removing, setRemoving] = useState<EmergencyContact | null>(null);
  const p = profile.personal;

  return (
    <div className="space-y-4">
      <Section title="Personal details" action={canEdit && <EditButton onClick={() => setEditing('personal')}>Edit</EditButton>}>
        <Facts columns={3} items={[
          { label: 'First name', value: p.firstName },
          { label: 'Middle name', value: p.middleName },
          { label: 'Last name', value: p.lastName },
          { label: 'Preferred name', value: p.preferredName },
          { label: 'Date of birth', value: p.dateOfBirth && day(p.dateOfBirth) },
          { label: 'Gender', value: p.genderCode && (GENDERS[p.genderCode] ?? p.genderCode) },
          { label: 'Marital status', value: p.maritalStatus && MARITAL[p.maritalStatus] },
          { label: 'Blood group', value: p.bloodGroup },
          { label: 'Nationality', value: countryName(p.nationalityCountryCode) },
        ]} />
      </Section>

      <Section title="Contact" action={canEdit && <EditButton onClick={() => setEditing('contact')}>Edit</EditButton>}>
        <Facts columns={3} items={[
          { label: 'Work email', value: p.workEmail && <a className="text-teal-700 hover:underline dark:text-teal-300" href={`mailto:${p.workEmail}`}>{p.workEmail}</a> },
          { label: 'Personal email', value: p.personalEmail },
          { label: 'Work phone', value: p.workMobile },
          { label: 'Personal phone', value: p.personalMobile },
          { label: 'Alternate phone', value: p.alternateMobile },
        ]} />
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {profile.addresses.map((address) => (
          <Section key={address.type} title={address.type === 'CURRENT' ? 'Present address' : 'Permanent address'}
            description={address.validFrom ? `Since ${day(address.validFrom)}` : undefined}
            action={canEdit && <EditButton onClick={() => setEditing(address.type)}>{address.addressLine1 ? 'Change' : 'Add'}</EditButton>}>
            {address.addressLine1 ? (
              <address className="text-sm not-italic leading-6 text-slate-800 dark:text-slate-100">
                {address.addressLine1}{address.addressLine2 && <><br />{address.addressLine2}</>}<br />
                {[address.city, address.stateRegion, address.postalCode].filter(Boolean).join(', ')}<br />
                {countryName(address.countryCode)}
              </address>
            ) : <p className="text-sm text-slate-500">No address recorded.</p>}
          </Section>
        ))}
      </div>

      <Section title="Emergency contacts" description="Who to call if something happens at work."
        action={canEdit && profile.emergencyContacts.length < 5 && <Button variant="outline" size="sm" onClick={() => setContact('new')}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add contact</Button>}>
        {profile.emergencyContacts.length === 0 ? (
          <p className="text-sm text-slate-500">No emergency contact recorded. Add at least one so HR can reach someone in an emergency.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
            {profile.emergencyContacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {c.contactName}
                    {c.relationship && <span className="font-normal text-slate-500">· {c.relationship}</span>}
                    {c.isPrimary && <Badge variant="info" size="sm">Primary</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{[c.mobileNumber, c.alternateMobileNumber, c.email].filter(Boolean).join(' · ')}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setContact(c)} aria-label={`Edit ${c.contactName}`}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(c)} aria-label={`Remove ${c.contactName}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(editing === 'personal' || editing === 'contact') && (
        <PersonalDialog part={editing} profile={profile} onSaved={onSaved} onClose={() => setEditing(null)} />
      )}
      {(editing === 'CURRENT' || editing === 'PERMANENT') && (
        <AddressDialog profile={profile} type={editing} onSaved={onSaved} onClose={() => setEditing(null)} />
      )}
      {contact && <ContactDialog profile={profile} contact={contact === 'new' ? null : contact} onSaved={onSaved} onClose={() => setContact(null)} />}
      {removing && <RemoveContactDialog profile={profile} contact={removing} onSaved={onSaved} onClose={() => setRemoving(null)} />}
    </div>
  );
};

type PersonalForm = Record<Exclude<keyof PersonalDetails, 'fullName'>, string>;

const PersonalDialog: React.FC<{ part: 'personal' | 'contact'; profile: EmployeeProfile; onSaved: Props['onSaved']; onClose: () => void }> = ({ part, profile, onSaved, onClose }) => {
  const initial = Object.fromEntries(Object.entries(profile.personal).map(([k, v]) => [k, v ?? ''])) as PersonalForm;
  const [form, setForm] = useState<PersonalForm>(initial);
  const set = (key: keyof PersonalForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const keys: (keyof PersonalForm)[] = part === 'personal'
    ? ['firstName', 'middleName', 'lastName', 'preferredName', 'dateOfBirth', 'genderCode', 'maritalStatus', 'bloodGroup', 'nationalityCountryCode']
    : ['workEmail', 'personalEmail', 'workMobile', 'personalMobile', 'alternateMobile'];

  const submit = () => {
    if (part === 'personal' && !form.firstName.trim()) return Promise.reject(new Error('First name is required.'));
    // Only what changed is sent, so a concurrent edit to another field is not overwritten.
    const changes: PersonalInput = {};
    for (const key of keys) {
      if (form[key] !== initial[key]) (changes as Record<string, string | null>)[key] = key === 'firstName' ? form[key].trim() : orNull(form[key]);
    }
    return employeeProfileApi.updatePersonal(profile.id, changes);
  };
  const text = (key: keyof PersonalForm, label: string, opts: { type?: string; required?: boolean; hint?: string; autoComplete?: string } = {}) => (
    <Field label={label} required={opts.required} hint={opts.hint}>
      {(a) => <input {...a} type={opts.type ?? 'text'} className={fieldClass} value={form[key]} onChange={set(key)} autoComplete={opts.autoComplete} required={opts.required} />}
    </Field>
  );
  const select = (key: keyof PersonalForm, label: string, options: [string, string][]) => (
    <Field label={label}>
      {(a) => (
        <select {...a} className={fieldClass} value={form[key]} onChange={set(key)}>
          <option value="">Not recorded</option>
          {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
      )}
    </Field>
  );

  return (
    <FormDialog title={part === 'personal' ? 'Edit personal details' : 'Edit contact details'} submitLabel="Save" onSubmit={submit} onSaved={onSaved} onClose={onClose} size="lg">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {part === 'personal' ? (
          <>
            {text('firstName', 'First name', { required: true, autoComplete: 'off' })}
            {text('middleName', 'Middle name')}
            {text('lastName', 'Last name')}
            {text('preferredName', 'Preferred name', { hint: 'What colleagues call them, if different.' })}
            {text('dateOfBirth', 'Date of birth', { type: 'date' })}
            {select('genderCode', 'Gender', Object.entries(GENDERS))}
            {select('maritalStatus', 'Marital status', Object.entries(MARITAL))}
            {select('bloodGroup', 'Blood group', BLOOD_GROUPS.map((g) => [g, g]))}
            {select('nationalityCountryCode', 'Nationality', COUNTRIES)}
          </>
        ) : (
          <>
            {text('workEmail', 'Work email', { type: 'email' })}
            {text('personalEmail', 'Personal email', { type: 'email' })}
            {text('workMobile', 'Work phone', { type: 'tel', hint: 'With country code, e.g. +91 98765 43210.' })}
            {text('personalMobile', 'Personal phone', { type: 'tel' })}
            {text('alternateMobile', 'Alternate phone', { type: 'tel' })}
          </>
        )}
      </div>
    </FormDialog>
  );
};

const AddressDialog: React.FC<{ profile: EmployeeProfile; type: Address['type']; onSaved: Props['onSaved']; onClose: () => void }> = ({ profile, type, onSaved, onClose }) => {
  const current = profile.addresses.find((a) => a.type === type);
  const [form, setForm] = useState({
    addressLine1: current?.addressLine1 ?? '', addressLine2: current?.addressLine2 ?? '', city: current?.city ?? '',
    stateRegion: current?.stateRegion ?? '', postalCode: current?.postalCode ?? '', countryCode: current?.countryCode ?? 'IN',
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = () => {
    if (!form.addressLine1.trim() || !form.city.trim()) return Promise.reject(new Error('Address line 1 and city are required.'));
    return employeeProfileApi.saveAddress(profile.id, type, {
      addressLine1: form.addressLine1.trim(), addressLine2: form.addressLine2.trim() || undefined, city: form.city.trim(),
      stateRegion: form.stateRegion.trim() || undefined, postalCode: form.postalCode.trim() || undefined, countryCode: form.countryCode,
    });
  };
  return (
    <FormDialog title={type === 'CURRENT' ? 'Present address' : 'Permanent address'} submitLabel="Save address" onSubmit={submit} onSaved={onSaved} onClose={onClose}
      description={current?.addressLine1 ? 'The previous address is kept in the record, ending today.' : undefined}>
      <Field label="Address line 1" required>{(a) => <input {...a} className={fieldClass} value={form.addressLine1} onChange={set('addressLine1')} autoComplete="address-line1" required />}</Field>
      <Field label="Address line 2">{(a) => <input {...a} className={fieldClass} value={form.addressLine2} onChange={set('addressLine2')} autoComplete="address-line2" />}</Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="City" required>{(a) => <input {...a} className={fieldClass} value={form.city} onChange={set('city')} autoComplete="address-level2" required />}</Field>
        <Field label="State or region">{(a) => <input {...a} className={fieldClass} value={form.stateRegion} onChange={set('stateRegion')} autoComplete="address-level1" />}</Field>
        <Field label="Postal code">{(a) => <input {...a} className={fieldClass} value={form.postalCode} onChange={set('postalCode')} autoComplete="postal-code" />}</Field>
        <Field label="Country" required>
          {(a) => <select {...a} className={fieldClass} value={form.countryCode} onChange={set('countryCode')}>{COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>}
        </Field>
      </div>
    </FormDialog>
  );
};

const ContactDialog: React.FC<{ profile: EmployeeProfile; contact: EmergencyContact | null; onSaved: Props['onSaved']; onClose: () => void }> = ({ profile, contact, onSaved, onClose }) => {
  const [form, setForm] = useState({
    contactName: contact?.contactName ?? '', relationship: contact?.relationship ?? '', mobileNumber: contact?.mobileNumber ?? '',
    alternateMobileNumber: contact?.alternateMobileNumber ?? '', email: contact?.email ?? '', isPrimary: contact?.isPrimary ?? profile.emergencyContacts.length === 0,
  });
  const set = (key: 'contactName' | 'relationship' | 'mobileNumber' | 'alternateMobileNumber' | 'email') => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = () => {
    if (!form.contactName.trim() || !form.mobileNumber.trim()) return Promise.reject(new Error('Name and phone are required.'));
    const input = {
      contactName: form.contactName.trim(), relationship: form.relationship.trim() || undefined, mobileNumber: form.mobileNumber.trim(),
      alternateMobileNumber: form.alternateMobileNumber.trim() || undefined, email: form.email.trim() || undefined, isPrimary: form.isPrimary,
    };
    return contact ? employeeProfileApi.updateContact(profile.id, contact.id, input) : employeeProfileApi.addContact(profile.id, input);
  };
  return (
    <FormDialog title={contact ? 'Edit emergency contact' : 'Add emergency contact'} submitLabel="Save contact" onSubmit={submit} onSaved={onSaved} onClose={onClose}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required>{(a) => <input {...a} className={fieldClass} value={form.contactName} onChange={set('contactName')} required />}</Field>
        <Field label="Relationship">{(a) => <input {...a} className={fieldClass} value={form.relationship} onChange={set('relationship')} placeholder="e.g. Spouse" />}</Field>
        <Field label="Phone" required>{(a) => <input {...a} type="tel" className={fieldClass} value={form.mobileNumber} onChange={set('mobileNumber')} required />}</Field>
        <Field label="Alternate phone">{(a) => <input {...a} type="tel" className={fieldClass} value={form.alternateMobileNumber} onChange={set('alternateMobileNumber')} />}</Field>
        <Field label="Email">{(a) => <input {...a} type="email" className={fieldClass} value={form.email} onChange={set('email')} />}</Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={form.isPrimary} onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))} />
        <Star className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> Primary contact (called first)
      </label>
    </FormDialog>
  );
};

const RemoveContactDialog: React.FC<{ profile: EmployeeProfile; contact: EmergencyContact; onSaved: Props['onSaved']; onClose: () => void }> = ({ profile, contact, onSaved, onClose }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setIsSaving(true);
    setError(null);
    try {
      onSaved(await employeeProfileApi.removeContact(profile.id, contact.id));
      toast.success(`${contact.contactName} removed from emergency contacts`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <Dialog title={`Remove ${contact.contactName} as an emergency contact?`} description={`${profile.personal.fullName} will no longer have them on record.`} onClose={() => !isSaving && onClose()} size="sm"
      footer={<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Keep</Button><Button type="button" variant="danger" onClick={remove} disabled={isSaving}>{isSaving ? 'Removing…' : 'Remove contact'}</Button></div>}>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <p className="text-sm text-slate-600 dark:text-slate-300">This cannot be undone, but you can add them again.</p>}
    </Dialog>
  );
};
