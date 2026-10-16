import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { KraLibraryTab } from './KraLibraryTab';
import { KpiLibraryTab } from './KpiLibraryTab';
import { RatingScalesTab } from './RatingScalesTab';
import { DepartmentHeadsTab } from './DepartmentHeadsTab';
import { TemplatesTab } from './TemplatesTab';
import { WorkflowsTab } from './WorkflowsTab';
import { MyAppraisalsTab } from './MyAppraisalsTab';
import { ReviewInboxTab } from './ReviewInboxTab';
import { CyclesTab } from './CyclesTab';

type Tab = 'mine' | 'inbox' | 'cycles' | 'kras' | 'kpis' | 'scales' | 'templates' | 'workflows' | 'heads';

const TABS: { id: Tab; label: string; permission: string }[] = [
  { id: 'mine', label: 'My appraisals', permission: 'performance.my.view' },
  { id: 'inbox', label: 'Review inbox', permission: 'performance.my.view' },
  { id: 'cycles', label: 'Appraisal cycles', permission: 'performance.cycles.view' },
  { id: 'kras', label: 'KRA library', permission: 'performance.library.view' },
  { id: 'kpis', label: 'KPI library', permission: 'performance.library.view' },
  { id: 'scales', label: 'Rating scales', permission: 'performance.library.view' },
  { id: 'templates', label: 'Appraisal templates', permission: 'performance.library.view' },
  { id: 'workflows', label: 'Review workflows', permission: 'performance.library.view' },
  { id: 'heads', label: 'Department heads', permission: 'performance.library.view' },
];

/** Performance (KRA & KPI): people's own appraisals and reviews, the cycles that run them, and the libraries and settings they are built from. */
export const PerformanceView: React.FC = () => {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.permission));
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab = tabs.find((t) => t.id === chosen)?.id ?? tabs[0]?.id;

  if (!tab) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-[#2B293E] dark:bg-[#181724]">You don’t have access to performance. Ask an administrator for a performance permission.</p>;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Performance" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-white/5">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`performance-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="performance-panel" onClick={() => setChosen(t.id)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${tab === t.id ? 'bg-white text-slate-900 shadow-sm dark:bg-[#181724] dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="performance-panel" aria-labelledby={`performance-tab-${tab}`}>
        {tab === 'mine' && <MyAppraisalsTab />}
        {tab === 'inbox' && <ReviewInboxTab />}
        {tab === 'cycles' && <CyclesTab />}
        {tab === 'kras' && <KraLibraryTab />}
        {tab === 'kpis' && <KpiLibraryTab />}
        {tab === 'scales' && <RatingScalesTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'workflows' && <WorkflowsTab />}
        {tab === 'heads' && <DepartmentHeadsTab />}
      </div>
    </div>
  );
};
