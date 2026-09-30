import React, { useId, useRef, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import {
  onboardingApi,
  type CandidateInterview,
  type EmailOutcome,
  type InterviewActionResult,
  type OnboardingMeta,
} from '../../api/onboarding.api';
import { BROWSER_TIMEZONE, fieldClass, isoToZonedTime, labelClass, zonedTimeToIso } from './onboarding-format';

type Done = (result: InterviewActionResult) => void;

const buttons = {
  primary: 'px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50',
  danger: 'px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50',
  secondary: 'px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5',
};

/** One request at a time, with the server's refusal kept in the dialog. */
function useSubmit<T>(run: () => Promise<T>, onDone: (value: T) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      onDone(await run());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { busy, error, setError, submit };
}

const ErrorLine: React.FC<{ message: string | null }> = ({ message }) =>
  message ? <p role="alert" className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{message}</p> : null;

/** A sentence about what happened to the emails, or null when nothing was attempted. */
export function describeEmails(outcomes: EmailOutcome[] | undefined): { tone: 'ok' | 'warn'; text: string } | null {
  if (!outcomes || outcomes.length === 0) return null;
  const sent = outcomes.filter((o) => o.status === 'SENT').length;
  const failed = outcomes.filter((o) => o.status !== 'SENT');
  if (failed.length === 0) return { tone: 'ok', text: `Email sent to ${sent} recipient${sent === 1 ? '' : 's'}.` };
  const reason = failed[0].error ?? 'The email could not be sent.';
  return { tone: 'warn', text: `${sent ? `Email sent to ${sent}, but not to ${failed.map((o) => o.recipient).join(', ')}. ` : 'No email was sent. '}${reason}` };
}

interface ScheduleProps {
  candidateId: string;
  meta: OnboardingMeta | null;
  /** When given, the interview is being rescheduled. */
  interview?: CandidateInterview;
  onClose: () => void;
  onDone: Done;
}

export const ScheduleInterviewDialog: React.FC<ScheduleProps> = ({ candidateId, meta, interview, onClose, onDone }) => {
  const ids = useId();
  const rescheduling = Boolean(interview);
  const [timezone, setTimezone] = useState(interview?.timezone ?? BROWSER_TIMEZONE);
  const [when, setWhen] = useState(interview ? isoToZonedTime(interview.startsAt, interview.timezone) : '');
  const [duration, setDuration] = useState(String(interview?.durationMinutes ?? 45));
  const [type, setType] = useState<CandidateInterview['interviewType']>(interview?.interviewType ?? 'ONLINE');
  const [location, setLocation] = useState(interview?.location ?? '');
  const [link, setLink] = useState(interview?.meetingLink ?? '');
  const [roundName, setRoundName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [panel, setPanel] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);

  const startsAt = when ? zonedTimeToIso(when, timezone) : null;
  const problems = [
    !startsAt && 'Choose the date and time.',
    !/^\d+$/.test(duration) || Number(duration) < 5 || Number(duration) > 600 ? 'The duration must be 5 to 600 minutes.' : null,
    type === 'IN_PERSON' && !location.trim() && 'Enter where the interview takes place.',
    type === 'ONLINE' && !/^https:\/\/\S+$/.test(link.trim()) && 'Enter the meeting link, starting with https://.',
    !rescheduling && panel.length === 0 && 'Choose at least one interviewer.',
    rescheduling && reason.trim().length < 3 && 'Say why it is being rescheduled.',
  ].filter(Boolean) as string[];

  const { busy, error, setError, submit } = useSubmit(
    () =>
      interview
        ? onboardingApi.reschedule(interview.id, {
            startsAt: startsAt!,
            durationMinutes: Number(duration),
            timezone,
            ...(type === 'IN_PERSON' ? { location: location.trim() } : {}),
            ...(type === 'ONLINE' ? { meetingLink: link.trim() } : {}),
            reason: reason.trim(),
            notify,
          })
        : onboardingApi.schedule(candidateId, {
            ...(roundName.trim() ? { roundName: roundName.trim() } : {}),
            interviewType: type,
            startsAt: startsAt!,
            durationMinutes: Number(duration),
            timezone,
            ...(type === 'IN_PERSON' ? { location: location.trim() } : {}),
            ...(type === 'ONLINE' ? { meetingLink: link.trim() } : {}),
            ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
            interviewerMemberIds: panel,
            notifyCandidate: notify,
            notifyInterviewers: notify,
          }),
    onDone,
  );

  return (
    <Dialog
      title={rescheduling ? `Reschedule round ${interview!.roundNumber}` : 'Schedule an interview'}
      description="Times are in the time zone you choose. We send email invitations from your workspace's email account; no calendar event is created."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={buttons.secondary}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => (problems.length ? setError(problems.join(' ')) : submit())} className={buttons.primary}>
            {busy ? 'Saving…' : rescheduling ? 'Reschedule' : 'Schedule interview'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!rescheduling && (
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-round`} className={labelClass}>Round name (optional)</label>
            <input id={`${ids}-round`} value={roundName} onChange={(e) => setRoundName(e.target.value)} maxLength={120} placeholder="e.g. Technical, Culture fit" className={fieldClass} />
          </div>
        )}
        <div>
          <label htmlFor={`${ids}-when`} className={labelClass}>Date and time *</label>
          <input id={`${ids}-when`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${ids}-tz`} className={labelClass}>Time zone *</label>
          <input id={`${ids}-tz`} value={timezone} onChange={(e) => setTimezone(e.target.value)} list={`${ids}-tz-list`} className={fieldClass} />
          <datalist id={`${ids}-tz-list`}>
            {[BROWSER_TIMEZONE, 'Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'Asia/Singapore'].map((tz) => <option key={tz} value={tz} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor={`${ids}-duration`} className={labelClass}>Duration (minutes) *</label>
          <input id={`${ids}-duration`} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} className={fieldClass} />
        </div>
        <fieldset disabled={rescheduling}>
          <legend className={labelClass}>Format *</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {(['ONLINE', 'PHONE', 'IN_PERSON'] as const).map((value) => (
              <label key={value} className="inline-flex items-center gap-1.5">
                <input type="radio" name={`${ids}-type`} checked={type === value} onChange={() => setType(value)} />
                {value === 'ONLINE' ? 'Online' : value === 'PHONE' ? 'Phone' : 'In person'}
              </label>
            ))}
          </div>
        </fieldset>
        {type === 'ONLINE' && (
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-link`} className={labelClass}>Meeting link *</label>
            <input id={`${ids}-link`} type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" maxLength={500} className={fieldClass} />
          </div>
        )}
        {type === 'IN_PERSON' && (
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-location`} className={labelClass}>Location *</label>
            <input id={`${ids}-location`} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} className={fieldClass} />
          </div>
        )}
        {!rescheduling && (
          <>
            <fieldset className="sm:col-span-2">
              <legend className={labelClass}>Interviewers *</legend>
              {meta && meta.members.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-[#2B293E]">
                  {meta.members.map((member) => (
                    <label key={member.id} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={panel.includes(member.id)}
                        onChange={(e) => setPanel((current) => (e.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id)))}
                      />
                      <span className="truncate">{member.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No team members are available to choose.</p>
              )}
            </fieldset>
            <div className="sm:col-span-2">
              <label htmlFor={`${ids}-instructions`} className={labelClass}>Instructions for the candidate (optional)</label>
              <textarea id={`${ids}-instructions`} rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} className={fieldClass} />
            </div>
          </>
        )}
        {rescheduling && (
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-reason`} className={labelClass}>Reason for the change *</label>
            <input id={`${ids}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={fieldClass} />
          </div>
        )}
        <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Email the candidate and interviewers
        </label>
      </div>
    </Dialog>
  );
};

export const CancelInterviewDialog: React.FC<{ interview: CandidateInterview; onClose: () => void; onDone: Done }> = ({ interview, onClose, onDone }) => {
  const ids = useId();
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const { busy, error, setError, submit } = useSubmit(() => onboardingApi.cancel(interview.id, reason.trim(), notify), onDone);
  return (
    <Dialog
      title={`Cancel round ${interview.roundNumber}?`}
      description="The interview stays on the candidate's record as cancelled."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={buttons.secondary}>Keep interview</button>
          <button type="button" disabled={busy} onClick={() => (reason.trim().length < 3 ? setError('Say why the interview is being cancelled.') : submit())} className={buttons.danger}>
            {busy ? 'Cancelling…' : 'Cancel interview'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <label htmlFor={`${ids}-reason`} className={labelClass}>Reason *</label>
      <input id={`${ids}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={fieldClass} />
      <label className="mt-3 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Email the candidate and interviewers
      </label>
    </Dialog>
  );
};

export const FeedbackDialog: React.FC<{ interview: CandidateInterview; onClose: () => void; onDone: Done }> = ({ interview, onClose, onDone }) => {
  const ids = useId();
  const [rating, setRating] = useState(0);
  const [recommendation, setRecommendation] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, error, setError, submit } = useSubmit(
    () => onboardingApi.feedback(interview.id, { rating, recommendation, ...(notes.trim() ? { notes: notes.trim() } : {}) }),
    onDone,
  );
  return (
    <Dialog
      title={`Your feedback: round ${interview.roundNumber}`}
      description="Only you can record your feedback. It can be changed until a decision is made."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttons.secondary}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => (!rating || !recommendation ? setError('Choose a rating and a recommendation.') : submit())} className={buttons.primary}>
            {busy ? 'Saving…' : 'Save feedback'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <fieldset>
        <legend className={labelClass}>Rating *</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className={`w-10 h-10 inline-flex items-center justify-center rounded-lg border text-sm font-semibold cursor-pointer ${rating === value ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 dark:border-[#2B293E]'}`}>
              <input type="radio" name={`${ids}-rating`} className="sr-only" checked={rating === value} onChange={() => setRating(value)} />
              {value}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${ids}-rec`} className={`${labelClass} mt-4`}>Recommendation *</label>
      <select id={`${ids}-rec`} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} className={fieldClass}>
        <option value="">Choose</option>
        <option value="STRONG_YES">Strong yes</option>
        <option value="YES">Yes</option>
        <option value="NO">No</option>
        <option value="STRONG_NO">Strong no</option>
      </select>
      <label htmlFor={`${ids}-notes`} className={`${labelClass} mt-4`}>Notes</label>
      <textarea id={`${ids}-notes`} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} className={fieldClass} />
    </Dialog>
  );
};

export const DecisionDialog: React.FC<{ interview: CandidateInterview; candidateName: string; onClose: () => void; onDone: Done }> = ({ interview, candidateName, onClose, onDone }) => {
  const ids = useId();
  const [decision, setDecision] = useState<'ADVANCE' | 'SELECT' | 'REJECT' | ''>('');
  const [notes, setNotes] = useState('');
  const { busy, error, setError, submit } = useSubmit(() => onboardingApi.decide(interview.id, decision as 'ADVANCE', notes.trim() || undefined), onDone);
  const given = interview.panel.filter((p) => p.submittedAt).length;
  return (
    <Dialog
      title={`Decide on ${candidateName} after round ${interview.roundNumber}`}
      description={`${given} of ${interview.panel.length} interviewer${interview.panel.length === 1 ? '' : 's'} have given feedback. A decision is final for this round.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttons.secondary}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => (!decision ? setError('Choose a decision.') : submit())} className={decision === 'REJECT' ? buttons.danger : buttons.primary}>
            {busy ? 'Saving…' : decision === 'SELECT' ? `Select ${candidateName}` : decision === 'REJECT' ? `Reject ${candidateName}` : 'Record decision'}
          </button>
        </>
      }
    >
      <ErrorLine message={error} />
      <fieldset>
        <legend className={labelClass}>Decision *</legend>
        <div className="space-y-2 text-sm">
          {([
            ['SELECT', 'Select the candidate', 'Moves them to Selected, ready for an offer.'],
            ['ADVANCE', 'Another round', 'Keeps them in the interview stage; schedule the next round.'],
            ['REJECT', 'Reject the candidate', 'Moves them to Rejected.'],
          ] as const).map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-2 p-2 rounded-lg border border-slate-200 dark:border-[#2B293E]">
              <input type="radio" name={`${ids}-decision`} className="mt-1" checked={decision === value} onChange={() => setDecision(value)} />
              <span><span className="font-semibold">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor={`${ids}-notes`} className={`${labelClass} mt-4`}>Notes</label>
      <textarea id={`${ids}-notes`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} className={fieldClass} />
    </Dialog>
  );
};
