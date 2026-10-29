import React, { useCallback, useEffect, useId, useState } from 'react';
import { ArrowLeft, UserCheck, Fingerprint, ExternalLink, Sparkles } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { useOptionalPayroll } from '../../context/PayrollContext';
import { toast } from '../../lib/toast';
import {
  CANDIDATE_STATUSES,
  onboardingApi,
  STATUS_LABELS,
  type CandidateDetail,
  type CandidateInterview,
  type CandidateStatus,
  type InterviewActionResult,
  type OnboardingMeta,
} from '../../api/onboarding.api';
import {
  onboardingWorkflowsApi,
  type CandidateStageOptionsResponse,
  type CandidateWorkflowStageOption,
} from '../../api/onboarding-workflows.api';
import {
  DECISION_LABELS,
  fieldClass,
  formatAmount,
  formatDate,
  formatDateTime,
  formatInTimezone,
  INTERVIEW_TYPE_LABELS,
  labelClass,
  RECOMMENDATION_LABELS,
  STATUS_VARIANT,
} from './onboarding-format';
import { CancelInterviewDialog, DecisionDialog, describeEmails, FeedbackDialog, ScheduleInterviewDialog } from './InterviewDialogs';
import { OFFER_VARIANT } from './OfferDetailView';
import { OFFER_STATUS_LABELS } from '../../api/onboarding.api';
import { CandidateDocuments } from './CandidateDocuments';
import { CandidateLetterDocuments } from './CandidateLetterDocuments';
import { ConvertToEmployeeModal } from './ConvertToEmployeeModal';

interface Props {
  candidateId: string;
  meta: OnboardingMeta | null;
  onBack: () => void;
  onEdit: (candidate: CandidateDetail) => void;
  onOpenOffer: (offerId: string) => void;
  onCreateOffer: (candidate: CandidateDetail) => void;
}

type Open =
  | { kind: 'schedule' }
  | { kind: 'reschedule' | 'cancel' | 'feedback' | 'decide'; interview: CandidateInterview }
  | { kind: 'move' }
  | { kind: 'override' }
  | { kind: 'archive' }
  | null;

const SCHEDULABLE: CandidateStatus[] = ['SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED'];
const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500';

/** A candidate's details, stage, interviews and full timeline, with the actions the viewer may take. */
export const CandidateDetailView: React.FC<Props> = ({ candidateId, meta, onBack, onEdit, onOpenOffer, onCreateOffer }) => {
  const ids = useId();
  const { can } = useAuth();
  const payroll = useOptionalPayroll();
  const setSelectedEmployeeId = payroll?.setSelectedEmployeeId;
  const navigateTo = payroll?.navigateTo;
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [emailNotice, setEmailNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(() => {
    setError(null);
    onboardingApi.getCandidate(candidateId).then(setCandidate).catch((e: Error) => setError(e.message));
  }, [candidateId]);
  useEffect(load, [load]);

  const afterInterviewAction = (message: string) => (result: InterviewActionResult) => {
    setCandidate(result.candidate);
    setOpen(null);
    setEmailNotice(describeEmails(result.notifications));
    toast.success(message);
  };

  if (error) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className={actionClass}>Back to onboarding</button>
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          The candidate could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      </div>
    );
  }
  if (!candidate) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-16 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />
        <div className="h-64 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" />
        <span className="sr-only" role="status">Loading the candidate</span>
      </div>
    );
  }

  const archived = Boolean(candidate.archivedAt);
  const hasLiveInterview = candidate.interviews.some((i) => i.status === 'SCHEDULED');
  const canSchedule = can('onboarding.interviews.schedule') && !archived && SCHEDULABLE.includes(candidate.status) && !hasLiveInterview;
  const now = Date.now();

  const details: [string, React.ReactNode][] = [
    ['Email', <a key="e" href={`mailto:${candidate.email}`} className="text-teal-700 dark:text-teal-300 hover:underline break-all">{candidate.email}</a>],
    ['Phone', candidate.phone ?? '—'],
    ['Department', candidate.departmentName ?? '—'],
    ['Designation', candidate.designationName ?? '—'],
    ['Employment type', candidate.employmentTypeName ?? '—'],
    ['Hiring source', candidate.hiringSource ?? '—'],
    ['Experience', candidate.experienceYears ? `${candidate.experienceYears} years` : '—'],
    ['Expected salary', formatAmount(candidate.expectedSalary)],
    ['Expected joining', candidate.expectedJoiningDate ? formatDate(candidate.expectedJoiningDate) : '—'],
    ['Recruiter', candidate.recruiterName ?? 'Unassigned'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button type="button" onClick={onBack} aria-label="Back to onboarding" className="p-2 rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-100 dark:hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 break-words">{candidate.fullName}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{candidate.candidateCode} · {candidate.appliedPosition}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[candidate.status]}>{STATUS_LABELS[candidate.status]}</Badge>
              {archived && <Badge variant="neutral">Archived</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Candidate-to-Employee Conversion or View Employee Profile */}
          {candidate.employeeId || candidate.status === 'JOINED' ? (
            candidate.employeeId && (
              <button
                type="button"
                onClick={() => {
                  if (candidate.employeeId && setSelectedEmployeeId && navigateTo) {
                    setSelectedEmployeeId(candidate.employeeId);
                    navigateTo('employee-detail');
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white inline-flex items-center gap-1.5 shadow-sm"
              >
                <UserCheck className="w-3.5 h-3.5" /> View Employee
              </button>
            )
          ) : (
            can('onboarding.candidates.manage') && !archived && (
              <button
                type="button"
                onClick={() => setShowConvertModal(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white inline-flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" /> Convert to Employee
              </button>
            )
          )}
          {canSchedule && (
            <button type="button" onClick={() => setOpen({ kind: 'schedule' })} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white">
              Schedule interview
            </button>
          )}
          {can('onboarding.candidates.manage') && !archived && candidate.manualMoves.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen({ kind: 'move' })}
              className={`${actionClass} text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-500/10 hover:bg-teal-100/60`}
            >
              Change stage
            </button>
          )}
          {can('onboarding.candidates.override') && !archived && candidate.status !== 'JOINED' && (
            <button
              type="button"
              onClick={() => setOpen({ kind: 'override' })}
              className={`${actionClass} text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-500/10 hover:bg-amber-100/60`}
            >
              Override stage
            </button>
          )}
          {can('onboarding.candidates.manage') && !archived && (
            <button type="button" onClick={() => onEdit(candidate)} className={actionClass}>Edit</button>
          )}
          {can('onboarding.candidates.manage') && (
            <button
              type="button"
              onClick={() =>
                archived
                  ? onboardingApi.restore(candidate.id).then((c) => { setCandidate(c); toast.success('Candidate restored'); }).catch((e: Error) => toast.error(e.message))
                  : setOpen({ kind: 'archive' })
              }
              className={actionClass}
            >
              {archived ? 'Restore' : 'Archive'}
            </button>
          )}
        </div>
      </div>

      {emailNotice && (
        <div role="status" className={`p-3 rounded-xl border text-sm flex items-start justify-between gap-3 ${emailNotice.tone === 'ok' ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <span>{emailNotice.text}</span>
          <button type="button" onClick={() => setEmailNotice(null)} className="text-xs font-semibold underline shrink-0">Dismiss</button>
        </div>
      )}

      {/* Converted Employee & COSEC Attendance Banner */}
      {candidate.employeeId && (
        <div className="p-4 rounded-2xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                  Official HRMS Employee
                </span>
                <Badge variant="success" size="sm">
                  {candidate.linkedEmployee?.employeeCode || 'Active Employee'}
                </Badge>
                {candidate.linkedEmployee?.cosecMapping?.mappingStatus && (
                  <Badge
                    variant={
                      candidate.linkedEmployee.cosecMapping.mappingStatus === 'MAPPED'
                        ? 'success'
                        : candidate.linkedEmployee.cosecMapping.mappingStatus === 'MAPPING_PENDING'
                        ? 'warning'
                        : 'danger'
                    }
                    size="sm"
                  >
                    <Fingerprint className="w-3 h-3 mr-1 inline" />
                    {candidate.linkedEmployee.cosecMapping.mappingStatus === 'MAPPED'
                      ? `COSEC Mapped (${candidate.linkedEmployee.cosecMapping.cosecEmployeeId || 'ID set'})`
                      : candidate.linkedEmployee.cosecMapping.mappingStatus === 'MAPPING_PENDING'
                      ? 'COSEC Mapping Pending'
                      : candidate.linkedEmployee.cosecMapping.mappingStatus}
                  </Badge>
                )}
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {candidate.linkedEmployee?.name || candidate.fullName} · {candidate.linkedEmployee?.workEmail || candidate.email}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {candidate.linkedEmployee?.hireDate ? `Joined ${formatDate(candidate.linkedEmployee.hireDate)}` : 'Onboarded'}
                {candidate.linkedEmployee?.cosecMapping?.lastSyncedAt && ` · Biometrics Synced: ${new Date(candidate.linkedEmployee.cosecMapping.lastSyncedAt).toLocaleString('en-IN')}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (candidate.employeeId && setSelectedEmployeeId && navigateTo) {
                setSelectedEmployeeId(candidate.employeeId);
                navigateTo('employee-detail');
              }
            }}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-700 text-white inline-flex items-center gap-1.5 shrink-0 self-start sm:self-center shadow-sm"
          >
            <span>View Employee Profile</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <section aria-labelledby={`${ids}-details`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <h2 id={`${ids}-details`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Details</h2>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {details.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="text-slate-900 dark:text-slate-100 break-words">{value}</dd>
                </div>
              ))}
              {candidate.address && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Address</dt><dd className="whitespace-pre-wrap break-words">{candidate.address}</dd></div>}
              {candidate.notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Notes</dt><dd className="whitespace-pre-wrap break-words">{candidate.notes}</dd></div>}
            </dl>
          </section>


          {can('onboarding.documents.view') && <CandidateLetterDocuments candidateId={candidate.id} candidateName={candidate.fullName} />}

          {can('onboarding.documents.view') && <CandidateDocuments candidateId={candidate.id} candidateName={candidate.fullName} onChanged={load} />}

          <section aria-labelledby={`${ids}-interviews`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
            <h2 id={`${ids}-interviews`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Interviews</h2>
            {candidate.interviews.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {candidate.status === 'NEW' ? 'Move the candidate to screening to schedule their first interview.' : 'No interviews yet.'}
              </p>
            ) : (
              <ol className="mt-3 space-y-3">
                {candidate.interviews.map((interview) => {
                  const started = new Date(interview.startsAt).getTime() <= now;
                  const canFeedback = interview.isMine && can('onboarding.interviews.feedback') && interview.status !== 'CANCELLED' && !interview.decision && started;
                  const canDecide =
                    can('onboarding.candidates.decide') && interview.status === 'COMPLETED' && !interview.decision && candidate.status === 'INTERVIEW_COMPLETED';
                  const canManage = can('onboarding.interviews.schedule') && interview.status === 'SCHEDULED';
                  return (
                    <li key={interview.id} className="p-3 rounded-xl border border-slate-200 dark:border-[#2B293E]">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            Round {interview.roundNumber}{interview.roundName ? `: ${interview.roundName}` : ''}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {formatInTimezone(interview.startsAt, interview.timezone)} · {interview.durationMinutes} min · {INTERVIEW_TYPE_LABELS[interview.interviewType]}
                            {interview.location ? ` · ${interview.location}` : ''}
                          </p>
                          {interview.meetingLink && (
                            <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-700 dark:text-teal-300 hover:underline break-all">{interview.meetingLink}</a>
                          )}
                        </div>
                        <Badge variant={interview.status === 'CANCELLED' ? 'neutral' : interview.status === 'COMPLETED' ? 'success' : 'purple'} size="sm">
                          {interview.status === 'SCHEDULED' ? 'Scheduled' : interview.status === 'COMPLETED' ? 'Held' : 'Cancelled'}
                        </Badge>
                      </div>
                      {interview.cancelReason && <p className="mt-1 text-xs text-slate-600">Cancelled: {interview.cancelReason}</p>}
                      <ul className="mt-2 space-y-1 text-xs">
                        {interview.panel.map((p) => (
                          <li key={p.memberId} className="text-slate-700 dark:text-slate-300">
                            <span className="font-semibold">{p.name}</span>:{' '}
                            {p.submittedAt ? `${RECOMMENDATION_LABELS[p.recommendation!]}, ${p.rating}/5${p.notes ? `, “${p.notes}”` : ''}` : 'no feedback yet'}
                          </li>
                        ))}
                      </ul>
                      {interview.decision && (
                        <p className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Decision: {DECISION_LABELS[interview.decision]}{interview.decidedBy ? ` by ${interview.decidedBy}` : ''}{interview.decisionNotes ? `, “${interview.decisionNotes}”` : ''}
                        </p>
                      )}
                      {(canFeedback || canDecide || canManage) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canFeedback && <button type="button" onClick={() => setOpen({ kind: 'feedback', interview })} className={actionClass}>Give feedback</button>}
                          {canDecide && <button type="button" onClick={() => setOpen({ kind: 'decide', interview })} className={actionClass}>Decide</button>}
                          {canManage && started && (
                            <button
                              type="button"
                              onClick={() => onboardingApi.complete(interview.id).then(afterInterviewAction('Interview marked as held')).catch((e: Error) => toast.error(e.message))}
                              className={actionClass}
                            >
                              Mark as held
                            </button>
                          )}
                          {canManage && <button type="button" onClick={() => setOpen({ kind: 'reschedule', interview })} className={actionClass}>Reschedule</button>}
                          {canManage && <button type="button" onClick={() => setOpen({ kind: 'cancel', interview })} className={`${actionClass} text-red-700`}>Cancel</button>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <section aria-labelledby={`${ids}-timeline`} className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]">
          <h2 id={`${ids}-timeline`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Timeline</h2>
          {can('onboarding.candidates.manage') && !archived && (
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim() || savingNote) return;
                setSavingNote(true);
                onboardingApi
                  .addNote(candidate.id, note.trim())
                  .then((c) => { setCandidate(c); setNote(''); })
                  .catch((err: Error) => toast.error(err.message))
                  .finally(() => setSavingNote(false));
              }}
            >
              <label htmlFor={`${ids}-note`} className={labelClass}>Add a note</label>
              <textarea id={`${ids}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} className={fieldClass} />
              <button type="submit" disabled={!note.trim() || savingNote} className={actionClass}>{savingNote ? 'Saving…' : 'Add note'}</button>
            </form>
          )}
          <ol className="mt-4 space-y-3">
            {candidate.timeline.map((event) => (
              <li key={event.id} className="pl-3 border-l-2 border-slate-200 dark:border-[#2B293E]">
                <p className="text-sm text-slate-900 dark:text-slate-100">
                  {event.summary}
                  {event.isOverride && <Badge variant="warning" size="sm" className="ml-2">Override</Badge>}
                </p>
                {event.notes && <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words">{event.notes}</p>}
                <p className="text-xs text-slate-400">{formatDateTime(event.createdAt)}{event.actorName ? ` · ${event.actorName}` : ''}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {open?.kind === 'schedule' && <ScheduleInterviewDialog candidateId={candidate.id} meta={meta} onClose={() => setOpen(null)} onDone={afterInterviewAction('Interview scheduled')} />}
      {open?.kind === 'reschedule' && <ScheduleInterviewDialog candidateId={candidate.id} meta={meta} interview={open.interview} onClose={() => setOpen(null)} onDone={afterInterviewAction('Interview rescheduled')} />}
      {open?.kind === 'cancel' && <CancelInterviewDialog interview={open.interview} onClose={() => setOpen(null)} onDone={afterInterviewAction('Interview cancelled')} />}
      {open?.kind === 'feedback' && <FeedbackDialog interview={open.interview} onClose={() => setOpen(null)} onDone={afterInterviewAction('Feedback saved')} />}
      {open?.kind === 'decide' && <DecisionDialog interview={open.interview} candidateName={candidate.fullName} onClose={() => setOpen(null)} onDone={afterInterviewAction('Decision recorded')} />}
      {(open?.kind === 'move' || open?.kind === 'override') && (
        <StageDialog
          candidate={candidate}
          override={open.kind === 'override'}
          onClose={() => setOpen(null)}
          onDone={(c) => { setCandidate(c); setOpen(null); toast.success(open.kind === 'override' ? 'Stage overridden' : 'Stage changed'); }}
        />
      )}
      {open?.kind === 'archive' && (
        <Dialog
          title={`Archive ${candidate.fullName}?`}
          description="They leave the active lists. Nothing is deleted, and you can restore them later."
          onClose={() => setOpen(null)}
          size="sm"
          footer={
            <>
              <button type="button" onClick={() => setOpen(null)} className={actionClass}>Keep active</button>
              <button
                type="button"
                onClick={() =>
                  onboardingApi.archive(candidate.id).then((c) => { setCandidate(c); setOpen(null); toast.success('Candidate archived'); }).catch((e: Error) => toast.error(e.message))
                }
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-800 hover:bg-slate-900 text-white"
              >
                Archive
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">A candidate with a scheduled interview can't be archived; cancel the interview first.</p>
        </Dialog>
      )}

      {showConvertModal && (
        <ConvertToEmployeeModal
          candidateId={candidate.id}
          candidateName={candidate.fullName}
          onClose={() => setShowConvertModal(false)}
          onSuccess={(_res) => {
            setShowConvertModal(false);
            load();
          }}
        />
      )}
    </div>
  );
};

/** A move along the workflow, or an override with a written reason. */
const StageDialog: React.FC<{ candidate: CandidateDetail; override: boolean; onClose: () => void; onDone: (candidate: CandidateDetail) => void }> = ({
  candidate,
  override,
  onClose,
  onDone,
}) => {
  const ids = useId();
  const [workflowData, setWorkflowData] = useState<CandidateStageOptionsResponse | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [status, setStatus] = useState<string>('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    onboardingWorkflowsApi
      .getCandidateStageOptions(candidate.id)
      .then((data) => {
        if (mounted) {
          setWorkflowData(data);
          setLoadingOptions(false);
        }
      })
      .catch(() => {
        if (mounted) setLoadingOptions(false);
      });
    return () => {
      mounted = false;
    };
  }, [candidate.id]);

  // Dynamic choices if workflow is active, otherwise fallback to legacy candidate.manualMoves
  const choices = workflowData
    ? override
      ? workflowData.allStages
          .filter((s) => s.stageKey !== candidate.status)
          .map((s) => ({ value: s.stageKey, label: `${s.name} (${s.stageType})`, obj: s }))
      : workflowData.validNextStages.map((s) => ({
          value: s.stageKey,
          label: s.transitionName ? `${s.name} — ${s.transitionName}` : `${s.name} (${s.stageType})`,
          obj: s,
        }))
    : override
    ? CANDIDATE_STATUSES.filter((s) => s !== candidate.status && s !== 'JOINED').map((s) => ({
        value: s,
        label: STATUS_LABELS[s],
        obj: null,
      }))
    : candidate.manualMoves.map((s) => ({
        value: s,
        label: STATUS_LABELS[s],
        obj: null,
      }));

  const currentStageName =
    workflowData?.currentStage?.name ||
    STATUS_LABELS[candidate.status as CandidateStatus] ||
    candidate.status;

  const selectedChoice = choices.find((c) => c.value === status);
  const targetLabel = selectedChoice?.label || status;

  const save = async () => {
    if (!status) return setError('Choose the new stage.');
    if (override && text.trim().length < 10) return setError('Explain the administrative override in at least 10 characters.');
    setBusy(true);
    setError(null);
    try {
      const updated = override
        ? await onboardingWorkflowsApi.overrideCandidateStage(candidate.id, status, text.trim())
        : await onboardingWorkflowsApi.changeCandidateStage(candidate.id, status, text.trim() || undefined);
      onDone(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The stage could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={override ? 'Override Candidate Stage (Administrative)' : 'Change Candidate Stage'}
      description={
        override
          ? `Administratively moves the candidate to any recruitment workflow stage outside standard progression rules. Current stage: ${currentStageName}. A mandatory reason (min 10 characters) is permanently logged.`
          : `Move the candidate along permitted workflow transitions. Current stage: ${currentStageName}.${
              workflowData?.workflow ? ` (Workflow: ${workflowData.workflow.name} v${workflowData.workflow.versionNumber})` : ''
            }`
      }
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={actionClass}>Cancel</button>
          <button
            type="button"
            disabled={busy || !status || (override && text.trim().length < 10)}
            onClick={save}
            className={`px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50 transition-colors ${
              override ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {busy ? 'Saving…' : status ? `${override ? 'Override to' : 'Move to'} ${targetLabel}` : override ? 'Override stage' : 'Change stage'}
          </button>
        </>
      }
    >
      {error && <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}

      {loadingOptions ? (
        <div className="py-4 text-center text-xs text-slate-500">Loading workflow stage options…</div>
      ) : choices.length === 0 ? (
        <div className="p-3 mb-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
          No permitted next stages found for current stage <strong>{currentStageName}</strong>. If this candidate is in a terminal stage, no further standard transitions are permitted. Use &quot;Override Stage&quot; if an administrative correction is required.
        </div>
      ) : (
        <>
          <label htmlFor={`${ids}-status`} className={labelClass}>
            {override ? 'Target stage (Administrative override) *' : 'Next permitted stage *'}
          </label>
          <select id={`${ids}-status`} value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
            <option value="">Choose new stage</option>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </>
      )}

      <label htmlFor={`${ids}-text`} className={`${labelClass} mt-3`}>
        {override ? (
          <>
            Override reason <span className="text-red-500 font-semibold">* (min 10 characters)</span>
          </>
        ) : (
          'Note (optional)'
        )}
      </label>
      <textarea
        id={`${ids}-text`}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        placeholder={override ? 'Enter detailed reason for the administrative override…' : 'Add an optional note…'}
        className={fieldClass}
      />
    </Dialog>
  );
};
