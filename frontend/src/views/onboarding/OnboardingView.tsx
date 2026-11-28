import React, { useCallback, useEffect, useState } from 'react';
import { onboardingApi, type CandidateDetail, type CandidateListQuery, type OnboardingMeta } from '../../api/onboarding.api';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { OnboardingDashboard } from './OnboardingDashboard';
import { CandidatesList } from './CandidatesList';
import { CandidateForm } from './CandidateForm';
import { CandidateDetailView } from './CandidateDetailView';
import { InterviewsView } from './InterviewsView';
import { OffersList } from './OffersList';
import { OfferDetailView } from './OfferDetailView';
import { OfferEditor } from './OfferEditor';
import { CentralDocumentsView } from './CentralDocumentsView';
import { WorkflowBuilderView } from './workflow-builder/WorkflowBuilderView';
import type { OfferDetail } from '../../api/onboarding.api';

type Tab = 'dashboard' | 'candidates' | 'interviews' | 'offers' | 'documents' | 'workflows';
const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'offers', label: 'Offers' },
  { id: 'documents', label: 'Documents' },
  { id: 'workflows', label: 'Workflows' },
];
const isTab = (value: string | null): value is Tab => TABS.some((t) => t.id === value);
const tabFromUrl = (): Tab => {
  const value = new URLSearchParams(window.location.search).get('tab');
  return isTab(value) ? value : 'dashboard';
};

export const EMPTY_FILTERS: CandidateListQuery = { page: 1, limit: 20, search: '', status: '', archived: 'active' };

/** HRMS → Onboarding: the dashboard, candidates and interviews, each loaded from the server. */
export const OnboardingView: React.FC = () => {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const [filters, setFilters] = useState<CandidateListQuery>(EMPTY_FILTERS);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const [form, setForm] = useState<{ candidate: CandidateDetail | null } | null>(null);
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);
  const [offerEditor, setOfferEditor] = useState<{ candidateId: string; candidateName: string; offer?: OfferDetail } | null>(null);
  const [awaitingMyApproval, setAwaitingMyApproval] = useState(false);
  const [meta, setMeta] = useState<OnboardingMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const loadMeta = useCallback(() => {
    setMetaError(null);
    onboardingApi.meta().then(setMeta).catch((error: Error) => setMetaError(error.message));
  }, []);
  useEffect(loadMeta, [loadMeta]);

  // Only show tabs whose data this person may read; the server refuses the rest anyway.
  const visibleTabs = TABS.filter((t) => t.id !== 'documents' || can('onboarding.documents.view'));
  const currentTab: Tab = visibleTabs.some((t) => t.id === tab) ? tab : 'dashboard';

  // Keep the tab in the address so a refresh or a shared link opens the same tab.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') === currentTab) return;
    url.searchParams.set('tab', currentTab);
    window.history.replaceState(window.history.state, '', url);
  }, [currentTab]);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = visibleTabs.findIndex((t) => t.id === currentTab);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1 : step ? (index + step + visibleTabs.length) % visibleTabs.length : -1;
    if (target < 0) return;
    event.preventDefault();
    const next = visibleTabs[target].id;
    setTab(next);
    document.getElementById(`onboarding-tab-${next}`)?.focus();
  };

  const showCandidates = (next: Partial<CandidateListQuery>) => {
    setFilters({ ...EMPTY_FILTERS, ...next });
    setOpenCandidateId(null);
    setTab('candidates');
  };

  const openCandidate = (id: string) => {
    setOpenOfferId(null);
    setOpenCandidateId(id);
  };

  if (offerEditor) {
    return (
      <OfferEditor
        candidateId={offerEditor.candidateId}
        candidateName={offerEditor.candidateName}
        offer={offerEditor.offer}
        meta={meta}
        onCancel={() => setOfferEditor(null)}
        onSaved={(saved) => {
          setOfferEditor(null);
          setOpenOfferId(saved.id);
        }}
      />
    );
  }

  if (openOfferId) {
    return (
      <OfferDetailView
        offerId={openOfferId}
        meta={meta}
        onBack={() => setOpenOfferId(null)}
        onEdit={(offer) => setOfferEditor({ candidateId: offer.candidate.id, candidateName: offer.candidate.name, offer })}
        onOpenCandidate={openCandidate}
      />
    );
  }

  if (form) {
    return (
      <CandidateForm
        candidate={form.candidate}
        meta={meta}
        onCancel={() => setForm(null)}
        onSaved={(saved) => {
          setForm(null);
          setOpenCandidateId(saved.id);
        }}
        onRefreshMeta={loadMeta}
      />
    );
  }

  if (openCandidateId) {
    return (
      <CandidateDetailView
        candidateId={openCandidateId}
        meta={meta}
        onBack={() => setOpenCandidateId(null)}
        onEdit={(candidate) => setForm({ candidate })}
        onOpenOffer={setOpenOfferId}
        onCreateOffer={(candidate) => setOfferEditor({ candidateId: candidate.id, candidateName: candidate.fullName })}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Onboarding</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Candidates from first contact through interviews, offers and documents to their first day.</p>
        </div>
        {can('onboarding.candidates.manage') && (
          <button
            type="button"
            onClick={() => setForm({ candidate: null })}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            Add candidate
          </button>
        )}
      </div>

      {metaError && (
        <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>The departments and team members could not be loaded: {metaError}</span>
          <button type="button" onClick={loadMeta} className="font-semibold underline">Try again</button>
        </div>
      )}

      <div role="tablist" aria-label="Onboarding" className="flex gap-1 border-b border-slate-200 dark:border-[#2B293E] overflow-x-auto">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            id={`onboarding-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={currentTab === item.id}
            aria-controls="onboarding-tabpanel"
            tabIndex={currentTab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={onTabKeyDown}
            className={cn(
              'px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-t-lg',
              currentTab === item.id ? 'border-teal-500 text-teal-700 dark:text-teal-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="onboarding-tabpanel" aria-labelledby={`onboarding-tab-${currentTab}`}>
        {currentTab === 'dashboard' && (
          <OnboardingDashboard
            onShowCandidates={showCandidates}
            onShowInterviews={() => setTab('interviews')}
            onShowOffers={(mine) => { setAwaitingMyApproval(mine); setTab('offers'); }}
            onAddCandidate={can('onboarding.candidates.manage') ? () => setForm({ candidate: null }) : undefined}
            onOpenCandidate={openCandidate}
          />
        )}
        {currentTab === 'candidates' && <CandidatesList filters={filters} onFiltersChange={setFilters} meta={meta} onOpen={setOpenCandidateId} />}
        {currentTab === 'interviews' && <InterviewsView onOpenCandidate={setOpenCandidateId} />}
        {currentTab === 'offers' && (
          <OffersList
            awaitingMyApproval={awaitingMyApproval}
            onAwaitingMyApprovalChange={setAwaitingMyApproval}
            onOpen={setOpenOfferId}
            meta={meta}
            onOpenCandidate={openCandidate}
          />
        )}
        {currentTab === 'documents' && <CentralDocumentsView onOpenCandidate={openCandidate} />}
        {currentTab === 'workflows' && <WorkflowBuilderView />}
      </div>
    </div>
  );
};
