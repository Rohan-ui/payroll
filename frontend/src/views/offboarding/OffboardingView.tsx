import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MyExitTab } from './MyExitTab';
import { ExitsTab } from './ExitsTab';

type Tab = 'exits' | 'mine';

const TABS: { id: Tab; label: string; permission: string }[] = [
  { id: 'exits', label: 'Exits', permission: 'offboarding.view' },
  { id: 'mine', label: 'My resignation', permission: 'offboarding.my.view' },
];

/** Offboarding: HR's exits and their checklists, and everyone's own resignation. */
export const OffboardingView: React.FC = () => {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.permission));
  const [chosen, setChosen] = useState<Tab | null>(null);
  const tab = tabs.find((t) => t.id === chosen)?.id ?? tabs[0]?.id;

  if (!tab) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-[#2B293E] dark:bg-[#181724]">You don’t have access to offboarding. Ask an administrator for an offboarding permission.</p>;
  if (tabs.length === 1) return tab === 'mine' ? <MyExitTab /> : <ExitsTab />;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Offboarding" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-white/5">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`offboarding-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="offboarding-panel" onClick={() => setChosen(t.id)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${tab === t.id ? 'bg-white text-slate-900 shadow-sm dark:bg-[#181724] dark:text-slate-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="offboarding-panel" aria-labelledby={`offboarding-tab-${tab}`}>
        {tab === 'exits' && <ExitsTab />}
        {tab === 'mine' && <MyExitTab />}
      </div>
    </div>
  );
};
