import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { employeeProfileApi, type EmployeeProfile } from '../api/employee-profile.api';
import { errorText, day, todayIso } from './payroll/payroll-format';
import { statusMeta } from './EmployeesView';
import { Facts, Section } from './employee/profile-ui';
import { PersonalTab } from './employee/PersonalTab';
import { EmploymentTab, StatusDialog } from './employee/EmploymentTab';
import { PayTab } from './employee/PayTab';
import { AttendanceTab } from './employee/AttendanceTab';
import { LeaveTab } from './employee/LeaveTab';
import { ActivityTab } from './employee/ActivityTab';
import { DocumentsTab } from './employee/DocumentsTab';
import { AssetsPanel } from './employee/AssetsPanel';
import { assetsApi } from '../api/assets.api';
import { takeProfileEditRequest } from './employee/profile-intent';
import { ReportingManagerCard } from './employee/ReportingManagerCard';
import { SignInCard } from './employee/SignInCard';
import { CosecMappingCard } from './employee/CosecMappingCard';

export type ProfileTab = 'overview' | 'personal' | 'employment' | 'reporting' | 'documents' | 'assets' | 'pay' | 'attendance' | 'leave' | 'activity';

/**
 * One employee's workspace: everything HR keeps about them, each part read
 * from the module that owns it and changed through that module's rules. The
 * page always shows what the server returned after a save.
 */
export const EmployeeDetailView: React.FC<{ initialTab?: ProfileTab }> = ({ initialTab = 'overview' }) => {
  // Read once: Edit from the People list lands on Personal with the form open.
  const [editRequested] = useState(takeProfileEditRequest);
  const { selectedEmployeeId, setSelectedEmployeeId, setCurrentView } = usePayroll();
  const { can } = useAuth();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<ProfileTab>(editRequested ? 'personal' : initialTab);
  const [activityKey, setActivityKey] = useState(0);
  const [changingStatus, setChangingStatus] = useState(false);
  const tabRefs = useRef<Partial<Record<ProfileTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (!selectedEmployeeId) return;
    let live = true;
    setError(null);
    employeeProfileApi.get(selectedEmployeeId)
      .then((p) => live && setProfile(p))
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [selectedEmployeeId, reload]);

  const loadAssets = useCallback(() => assetsApi.list(selectedEmployeeId ?? ''), [selectedEmployeeId]);

  const saved = useCallback((next: EmployeeProfile) => {
    setProfile(next);
    setActivityKey((n) => n + 1);
  }, []);

  if (!selectedEmployeeId) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No employee selected.</p>
        <Button variant="secondary" className="mx-auto mt-4" onClick={() => setCurrentView('people')}>Back to People</Button>
      </div>
    );
  }
  if (error && !profile) {
    return (
      <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
        <p className="text-sm font-semibold text-red-700 dark:text-red-300">This employee could not be loaded: {error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => setCurrentView('people')}>Back to People</Button>
          <Button variant="primary" className="gap-2" onClick={() => setReload((n) => n + 1)}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</Button>
        </div>
      </div>
    );
  }
  if (!profile) {
    return <div className="h-96 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none dark:bg-[#1E1D2D]" aria-busy="true" aria-label="Loading employee" />;
  }

  const canEdit = can('people.update');
  const job = profile.employment;
  const manager = profile.manager;
  const status = statusMeta(profile.employeeStatus);
  const onProbation = profile.employeeStatus === 'ACTIVE' && !!job?.probationEndDate && job.probationEndDate >= todayIso();
  const tabs: { id: ProfileTab; label: string; shown: boolean }[] = [
    { id: 'overview', label: 'Overview', shown: true },
    { id: 'personal', label: 'Personal', shown: true },
    { id: 'employment', label: 'Employment', shown: true },
    { id: 'reporting', label: 'Reporting', shown: true },
    { id: 'documents', label: 'Documents', shown: true },
    { id: 'assets', label: 'Assets', shown: can('assets.view') },
    { id: 'pay', label: 'Pay', shown: can('salary.view') || profile.canSeeBankAccount || (can('payroll.view') && can('salary.view')) },
    { id: 'attendance', label: 'Attendance', shown: can('attendance.view') },
    { id: 'leave', label: 'Leave', shown: can('leave.view') },
    { id: 'activity', label: 'Activity', shown: true },
  ];
  const visible = tabs.filter((t) => t.shown);
  const active = visible.some((t) => t.id === tab) ? tab : 'overview';

  // Arrow keys move between tabs, as the ARIA tabs pattern expects.
  const onTabKey = (event: React.KeyboardEvent) => {
    const index = visible.findIndex((t) => t.id === active);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const target = event.key === 'Home' ? visible[0] : event.key === 'End' ? visible[visible.length - 1] : visible[(index + step + visible.length) % visible.length];
    setTab(target.id);
    tabRefs.current[target.id]?.focus();
  };

  const openEmployee = (id: string) => {
    setProfile(null);
    setTab('overview');
    setSelectedEmployeeId(id);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-[#2B293E] dark:bg-[#181724]">
        <div className="flex min-w-0 items-center gap-4">
          <button type="button" onClick={() => setCurrentView('people')} aria-label="Back to People"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-[#2B293E] dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <Avatar name={profile.personal.fullName} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-bold text-slate-800 dark:text-white">{profile.personal.fullName}</h1>
              <Badge variant={status.variant}>{status.label}</Badge>
              {onProbation && <Badge variant="info">On probation</Badge>}
            </div>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
              <span className="font-mono">{profile.employeeCode}</span>
              {[job?.designation?.name, job?.department?.name].filter(Boolean).map((part) => ` · ${part}`).join('')}
            </p>
          </div>
        </div>
        {canEdit && profile.employeeStatus !== 'EXITED' && (
          <Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => setChangingStatus(true)}>Change status</Button>
        )}
      </header>

      {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{error}</p>}

      <div role="tablist" aria-label="Employee sections" onKeyDown={onTabKey} className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-[#2B293E]">
        {visible.map((t) => (
          <button key={t.id} ref={(el) => { tabRefs.current[t.id] = el; }} type="button" role="tab" id={`employee-tab-${t.id}`}
            aria-selected={active === t.id} aria-controls="employee-panel" tabIndex={active === t.id ? 0 : -1} onClick={() => setTab(t.id)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${active === t.id ? 'border-teal-600 text-teal-800 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="employee-panel" aria-labelledby={`employee-tab-${active}`}>
        {active === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Section title="Summary">
                <Facts columns={2} items={[
                  { label: 'Official email', value: profile.personal.workEmail },
                  { label: 'Contact number', value: profile.personal.workMobile ?? profile.personal.personalMobile },
                  { label: 'Department', value: job?.department?.name },
                  { label: 'Designation', value: job?.designation?.name },
                  { label: 'Reporting manager', value: manager && <button type="button" className="text-teal-700 hover:underline dark:text-teal-300" onClick={() => openEmployee(manager.id)}>{manager.name}</button> },
                  { label: 'Joining date', value: job ? day(job.joiningDate) : profile.hireDate && day(profile.hireDate) },
                  { label: 'Employment type', value: job?.employmentType?.name },
                  { label: 'Work location', value: job?.branch?.name },
                ]} />
              </Section>
              {profile.emergencyContacts.length === 0 && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  No emergency contact is recorded. {canEdit ? 'Add one under Personal.' : ''}
                </p>
              )}
            </div>
            <div className="space-y-4">
              <SignInCard employeeId={profile.id} name={profile.personal.fullName} />
              <CosecMappingCard employeeId={profile.id} employeeCode={profile.employeeCode} employeeName={profile.personal.fullName} />
            </div>
          </div>
        )}
        {active === 'personal' && <PersonalTab profile={profile} canEdit={canEdit} onSaved={saved} startEditing={editRequested && canEdit} />}
        {active === 'employment' && <EmploymentTab profile={profile} canEdit={canEdit} onSaved={saved} />}
        {active === 'reporting' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReportingManagerCard employeeId={profile.id} />
            <Section title="Direct reports" description="People whose primary manager this employee is today.">
              {profile.directReports.length === 0 ? <p className="text-sm text-slate-500">Nobody reports to {profile.personal.firstName}.</p> : (
                <ul className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                  {profile.directReports.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                      <button type="button" onClick={() => openEmployee(r.id)} className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-slate-800 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded dark:text-slate-100">
                        <Avatar name={r.name} size="sm" /> <span className="truncate">{r.name}</span>
                      </button>
                      <span className="shrink-0 font-mono text-xs text-slate-500">{r.employeeCode}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
        {active === 'assets' && <AssetsPanel employeeId={profile.id} load={loadAssets} onChanged={() => setActivityKey((n) => n + 1)} />}
        {active === 'documents' && <DocumentsTab employeeId={profile.id} employeeName={profile.personal.fullName} onChanged={() => setActivityKey((n) => n + 1)} />}
        {active === 'pay' && <PayTab profile={profile} onSaved={saved} onOpenPayslips={() => setCurrentView('payslips')} />}
        {active === 'attendance' && <AttendanceTab employeeId={profile.id} />}
        {active === 'leave' && <LeaveTab employeeId={profile.id} />}
        {active === 'activity' && <ActivityTab employeeId={profile.id} refreshKey={activityKey} />}
      </div>

      {changingStatus && <StatusDialog profile={profile} onSaved={saved} onClose={() => setChangingStatus(false)} />}
    </div>
  );
};
