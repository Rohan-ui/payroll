import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { employeesApi, type EmployeeDirectoryFilters } from '../../api/employees.api';
import { employeeProfileApi, type EmployeeProfile, type EmploymentChangeInput, type EmploymentRecord } from '../../api/employee-profile.api';
import { day, errorText, fieldClass, todayIso } from '../payroll/payroll-format';
import { statusMeta } from '../EmployeesView';
import { Facts, Field, FormDialog, Section } from './profile-ui';

interface Props {
  profile: EmployeeProfile;
  canEdit: boolean;
  onSaved: (profile: EmployeeProfile) => void;
}

const SETTABLE_STATUSES = ['ACTIVE', 'ON_NOTICE', 'SUSPENDED', 'INACTIVE'] as const;

/** The job today, any change already scheduled, and every earlier record. */
export const EmploymentTab: React.FC<Props> = ({ profile, canEdit, onSaved }) => {
  const [changing, setChanging] = useState(false);
  const job = profile.employment;
  const exited = profile.employeeStatus === 'EXITED';

  return (
    <div className="space-y-4">
      <Section title="Current job"
        description={job ? `In effect since ${day(job.effectiveFrom)}` : undefined}
        action={canEdit && !exited && <Button variant="primary" size="sm" onClick={() => setChanging(true)}>Record a job change</Button>}>
        {job ? <JobFacts profile={profile} job={job} /> : (
          <p className="text-sm text-slate-500">No job record yet. Record a job change to set department, designation and work location.</p>
        )}
      </Section>

      {profile.upcomingEmployment && (
        <div role="note" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
          <strong>Scheduled change from {day(profile.upcomingEmployment.effectiveFrom)}:</strong>{' '}
          {[profile.upcomingEmployment.department?.name, profile.upcomingEmployment.designation?.name, profile.upcomingEmployment.branch?.name].filter(Boolean).join(' · ') || 'see history below'}
        </div>
      )}

      <Section title="Employment history" description="Each change starts a new record; earlier records are kept as they were.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Employment records, newest first</caption>
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200 dark:border-[#2B293E]">
                {['Period', 'Department', 'Designation', 'Work location', 'Type'].map((h) => <th key={h} scope="col" className="px-2 py-2 font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-[#2B293E] dark:text-slate-300">
              {profile.employmentHistory.length === 0 && <tr><td colSpan={5} className="px-2 py-4 text-slate-500">No job records yet.</td></tr>}
              {profile.employmentHistory.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-2 py-2.5">
                    {day(row.effectiveFrom)} – {row.effectiveTo ? day(row.effectiveTo) : 'present'}
                    {row.id === job?.id && <Badge variant="success" size="sm" className="ml-2">Current</Badge>}
                    {row.id === profile.upcomingEmployment?.id && <Badge variant="info" size="sm" className="ml-2">Scheduled</Badge>}
                  </td>
                  <td className="px-2 py-2.5">{row.department?.name ?? '—'}</td>
                  <td className="px-2 py-2.5">{row.designation?.name ?? '—'}</td>
                  <td className="px-2 py-2.5">{row.branch?.name ?? '—'}</td>
                  <td className="px-2 py-2.5">{row.employmentType?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {changing && <EmploymentChangeDialog profile={profile} onSaved={onSaved} onClose={() => setChanging(false)} />}
    </div>
  );
};

const JobFacts: React.FC<{ profile: EmployeeProfile; job: EmploymentRecord }> = ({ profile, job }) => {
  const probation = job.probationEndDate
    ? job.probationEndDate >= todayIso() ? `Until ${day(job.probationEndDate)}` : `Ended ${day(job.probationEndDate)}`
    : null;
  return (
    <Facts columns={3} items={[
      { label: 'Employee ID', value: <span className="font-mono">{profile.employeeCode}</span> },
      { label: 'Employment status', value: <Badge variant={statusMeta(profile.employeeStatus).variant} size="sm">{statusMeta(profile.employeeStatus).label}</Badge> },
      { label: 'Joining date', value: day(job.joiningDate) },
      { label: 'Department', value: job.department?.name },
      { label: 'Designation', value: job.designation?.name },
      { label: 'Work location', value: job.branch?.name },
      { label: 'Employment type', value: job.employmentType?.name },
      { label: 'Reporting manager', value: profile.manager?.name },
      { label: 'Probation', value: probation },
      { label: 'Confirmation date', value: job.confirmationDate && day(job.confirmationDate) },
      { label: 'Notice period', value: job.noticePeriodDays !== null ? `${job.noticePeriodDays} days` : null },
      ...(profile.exitDate ? [{ label: 'Exit date', value: day(profile.exitDate) }] : []),
    ]} />
  );
};

const EmploymentChangeDialog: React.FC<{ profile: EmployeeProfile; onSaved: Props['onSaved']; onClose: () => void }> = ({ profile, onSaved, onClose }) => {
  const job = profile.employment;
  const [options, setOptions] = useState<EmployeeDirectoryFilters | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const initial = {
    effectiveFrom: todayIso(),
    departmentId: job?.department?.id ?? '',
    designationId: job?.designation?.id ?? '',
    branchId: job?.branch?.id ?? '',
    employmentTypeId: job?.employmentType?.id ?? '',
    probationEndDate: job?.probationEndDate ?? '',
    confirmationDate: job?.confirmationDate ?? '',
    noticePeriodDays: job?.noticePeriodDays?.toString() ?? '',
    reason: '',
  };
  const [form, setForm] = useState(initial);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    employeesApi.directoryFilters().then(setOptions).catch((e) => setOptionsError(errorText(e)));
  }, []);

  const submit = () => {
    if (!form.effectiveFrom) return Promise.reject(new Error('Choose the date the change takes effect.'));
    if (form.reason.trim().length < 3) return Promise.reject(new Error('Say why the job changed.'));
    const input: EmploymentChangeInput = { effectiveFrom: form.effectiveFrom, reason: form.reason.trim() };
    const ids = ['departmentId', 'designationId', 'branchId', 'employmentTypeId', 'probationEndDate', 'confirmationDate'] as const;
    for (const key of ids) if (form[key] !== initial[key]) input[key] = form[key] || null;
    if (form.noticePeriodDays !== initial.noticePeriodDays) input.noticePeriodDays = form.noticePeriodDays === '' ? null : Number(form.noticePeriodDays);
    return employeeProfileApi.changeEmployment(profile.id, input);
  };

  const choose = (key: 'departmentId' | 'designationId' | 'branchId' | 'employmentTypeId', label: string, list: { id: string; name: string }[] | undefined) => (
    <Field label={label}>
      {(a) => (
        <select {...a} className={fieldClass} value={form[key]} onChange={set(key)} disabled={!list}>
          <option value="">{list ? 'None' : 'Loading…'}</option>
          {list?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
    </Field>
  );

  return (
    <FormDialog title="Record a job change" size="lg" submitLabel="Record change" onSubmit={submit} onSaved={onSaved} onClose={onClose}
      description="The current record ends the day before this date, and a new one starts with these values. Months already paid are not changed.">
      {optionsError && <p role="alert" className="text-sm text-red-700">The lists could not be loaded: {optionsError}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Takes effect from" required hint={job ? `After ${day(job.effectiveFrom)}, when the current record started.` : undefined}>
          {(a) => <input {...a} type="date" className={fieldClass} value={form.effectiveFrom} min={job?.effectiveFrom} onChange={set('effectiveFrom')} required />}
        </Field>
        <div />
        {choose('departmentId', 'Department', options?.departments.map((d) => ({ id: d.id, name: d.department_name })))}
        {choose('designationId', 'Designation', options?.designations.map((d) => ({ id: d.id, name: d.designation_name })))}
        {choose('branchId', 'Work location', options?.branches.map((b) => ({ id: b.id, name: b.branch_name })))}
        {choose('employmentTypeId', 'Employment type', options?.employmentTypes.map((t) => ({ id: t.id, name: t.employment_type_name })))}
        <Field label="Probation ends">{(a) => <input {...a} type="date" className={fieldClass} value={form.probationEndDate} onChange={set('probationEndDate')} />}</Field>
        <Field label="Confirmation date">{(a) => <input {...a} type="date" className={fieldClass} value={form.confirmationDate} onChange={set('confirmationDate')} />}</Field>
        <Field label="Notice period (days)">{(a) => <input {...a} type="number" min={0} max={365} inputMode="numeric" className={fieldClass} value={form.noticePeriodDays} onChange={set('noticePeriodDays')} />}</Field>
      </div>
      <Field label="Reason" required hint="Shown in the employee’s activity, e.g. “Promotion after annual review”.">
        {(a) => <textarea {...a} rows={2} maxLength={500} className={fieldClass} value={form.reason} onChange={set('reason')} required />}
      </Field>
    </FormDialog>
  );
};

/** Sets the employment status with a reason. Exits are recorded through Offboarding, never here. */
export const StatusDialog: React.FC<{ profile: EmployeeProfile; onSaved: Props['onSaved']; onClose: () => void }> = ({ profile, onSaved, onClose }) => {
  const [status, setStatus] = useState<string>(SETTABLE_STATUSES.find((s) => s !== profile.employeeStatus) ?? 'ACTIVE');
  const [reason, setReason] = useState('');
  const submit = () => {
    if (status === profile.employeeStatus) return Promise.reject(new Error(`The status is already ${statusMeta(status).label}.`));
    if (reason.trim().length < 3) return Promise.reject(new Error('Say why the status is changing.'));
    return employeeProfileApi.changeStatus(profile.id, status, reason.trim());
  };
  return (
    <FormDialog title={`Change ${profile.personal.fullName}’s employment status?`} submitLabel="Change status" onSubmit={submit} onSaved={onSaved} onClose={onClose}
      description={`Currently ${statusMeta(profile.employeeStatus).label}. To record someone leaving, start an exit in Offboarding instead.`}>
      <Field label="New status" required>
        {(a) => (
          <select {...a} className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            {SETTABLE_STATUSES.map((s) => <option key={s} value={s} disabled={s === profile.employeeStatus}>{statusMeta(s).label}</option>)}
          </select>
        )}
      </Field>
      <Field label="Reason" required hint="Kept in the employee’s activity.">
        {(a) => <textarea {...a} rows={2} maxLength={500} className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} required />}
      </Field>
    </FormDialog>
  );
};
