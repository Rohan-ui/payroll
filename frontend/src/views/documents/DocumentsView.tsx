import React, { useState } from 'react';
import { TemplatesView } from './TemplatesView';
import { LetterheadsView } from './LetterheadsView';
import { EmailTemplatesView } from './EmailTemplatesView';
import { DocumentTypesMaster } from '../settings/DocumentTypesMaster';

type Tab = 'templates' | 'candidate-document-types' | 'email-templates' | 'letterheads';
const TABS: { id: Tab; label: string }[] = [
  { id: 'templates', label: 'Document Templates' },
  { id: 'candidate-document-types', label: 'Candidate Document Types' },
  { id: 'email-templates', label: 'Email Templates' },
  { id: 'letterheads', label: 'Letterheads' },
];

/**
 * Organization & Settings → Documents & letterheads: the templates every
 * module makes documents from (offer letters, quotations, appraisal letters),
 * customizable email templates, and the letterheads they print on.
 */
export const DocumentsView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('templates');
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Documents & letterheads</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Templates for offer letters, appointment letters, and agreements; candidate document upload rules; reusable email templates; and printable letterheads.
        </p>
      </div>
      <div role="tablist" aria-label="Documents & letterheads" className="flex gap-1 border-b border-slate-200 dark:border-[#2B293E] overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`documents-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="documents-panel" onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${tab === t.id ? 'border-teal-500 text-teal-700 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="documents-panel" aria-labelledby={`documents-tab-${tab}`}>
        {tab === 'templates' && <TemplatesView />}
        {tab === 'candidate-document-types' && <DocumentTypesMaster />}
        {tab === 'email-templates' && <EmailTemplatesView />}
        {tab === 'letterheads' && <LetterheadsView />}
      </div>
    </div>
  );
};
