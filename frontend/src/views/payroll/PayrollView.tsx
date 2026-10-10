import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { RunPayrollWizardView } from '../RunPayrollWizardView';
import { PayrollOverviewTab, type PayrollDestination } from './PayrollOverviewTab';
import { PoliciesTab } from './PoliciesTab';
import { StructuresTab } from './StructuresTab';
import { ComponentsTab } from './ComponentsTab';
import { SalaryImportTab } from './SalaryImportTab';
import { PayPreviewTab } from './PayPreviewTab';
import { MonthlyEntriesTab } from './MonthlyEntriesTab';
import { OvertimeTab } from './OvertimeTab';
import { LoansTab } from './LoansTab';

type Section = 'overview' | 'run' | 'preview' | 'inputs' | 'setup';
type Sub = 'entries' | 'overtime' | 'loans' | 'policies' | 'structures' | 'components' | 'import';
interface Item<T> { id: T; label: string; permissions: string[] }

const SECTIONS: Item<Section>[] = [
  { id: 'overview', label: 'Overview', permissions: ['payroll.view'] },
  { id: 'run', label: 'Payroll run', permissions: ['payroll.view'] },
  { id: 'preview', label: 'Pay preview', permissions: ['payroll.view', 'salary.view'] },
  { id: 'inputs', label: 'Monthly inputs', permissions: ['payroll.view'] },
  { id: 'setup', label: 'Setup', permissions: [] },
];
const SUBS: Record<'inputs' | 'setup', Item<Sub>[]> = {
  inputs: [
    { id: 'entries', label: 'Monthly entries', permissions: ['payroll.view'] },
    { id: 'overtime', label: 'Overtime', permissions: ['payroll.view'] },
    { id: 'loans', label: 'Loans & advances', permissions: ['payroll.view'] },
  ],
  setup: [
    { id: 'policies', label: 'Policies', permissions: ['payroll.policies.view'] },
    { id: 'structures', label: 'Salary structures', permissions: ['salary.view'] },
    { id: 'components', label: 'Components', permissions: ['salary.view'] },
    { id: 'import', label: 'Import salaries', permissions: ['salary.configure', 'salary.assign'] },
  ],
};

const tabClass = (selected: boolean) =>
  `shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${selected ? 'bg-white text-slate-900 shadow-sm dark:bg-[#181724] dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`;

/** Payroll: the month at a glance, running payroll, its monthly inputs, and the setup it is worked out from. */
export const PayrollView: React.FC = () => {
  const { can } = useAuth();
  const allowed = <T,>(items: Item<T>[]) => items.filter((t) => t.permissions.every((p) => can(p)));
  const subs = { inputs: allowed(SUBS.inputs), setup: allowed(SUBS.setup) };
  const sections = allowed(SECTIONS).filter((s) => (s.id === 'inputs' || s.id === 'setup' ? subs[s.id].length > 0 : true));
  const [chosen, setChosen] = useState<Section | null>(null);
  const [chosenSub, setChosenSub] = useState<Partial<Record<'inputs' | 'setup', Sub>>>({});
  const section = sections.find((s) => s.id === chosen)?.id ?? sections[0]?.id;

  if (!section) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-[#2B293E] dark:bg-[#181724]">You don’t have access to payroll. Ask an administrator for a payroll or salary permission.</p>;

  const group = section === 'inputs' || section === 'setup' ? section : null;
  const sub = group ? (subs[group].find((t) => t.id === chosenSub[group])?.id ?? subs[group][0].id) : null;
  const navigate = (to: PayrollDestination) => {
    if (to === 'setup') setChosenSub((c) => ({ ...c, setup: subs.setup.some((t) => t.id === 'import') ? 'import' : 'structures' }));
    setChosen(to);
  };

  return (
    <div className="space-y-4">
      {(sections.length > 1 || (group && subs[group].length > 1)) && (
        <nav aria-label="Payroll">
          {sections.length > 1 && <div role="tablist" aria-label="Payroll sections" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-white/5">
            {sections.map((s) => (
              <button key={s.id} type="button" role="tab" id={`payroll-tab-${s.id}`} aria-selected={section === s.id} aria-controls="payroll-panel" onClick={() => setChosen(s.id)} className={tabClass(section === s.id)}>
                {s.label}
              </button>
            ))}
          </div>}
          {group && subs[group].length > 1 && (
            <div role="tablist" aria-label={group === 'inputs' ? 'Monthly inputs' : 'Setup'} className="mt-2 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-[#2B293E]">
              {subs[group].map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={sub === t.id} onClick={() => setChosenSub((c) => ({ ...c, [group]: t.id }))}
                  className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${sub === t.id ? 'border-teal-600 text-teal-800 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </nav>
      )}
      <div role="tabpanel" id="payroll-panel" aria-labelledby={`payroll-tab-${section}`}>
        {section === 'overview' && <PayrollOverviewTab onNavigate={navigate} />}
        {section === 'run' && <RunPayrollWizardView />}
        {section === 'preview' && <PayPreviewTab />}
        {sub === 'entries' && <MonthlyEntriesTab />}
        {sub === 'overtime' && <OvertimeTab />}
        {sub === 'loans' && <LoansTab />}
        {sub === 'policies' && <PoliciesTab />}
        {sub === 'structures' && <StructuresTab />}
        {sub === 'components' && <ComponentsTab />}
        {sub === 'import' && <SalaryImportTab />}
      </div>
    </div>
  );
};
