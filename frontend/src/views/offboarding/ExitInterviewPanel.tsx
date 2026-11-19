import React, { useEffect, useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { offboardingApi, type ExitDetail, type ExitInterviewInput, type ExitReason } from '../../api/offboarding.api';
import { cardClass, day, errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';

const RATINGS = [
  { key: 'workplace', label: 'Workplace' },
  { key: 'compensation', label: 'Compensation' },
  { key: 'growth', label: 'Growth opportunities' },
] as const;

const rehireText = (eligible: boolean | null) => (eligible == null ? 'Rehire not decided' : eligible ? 'Eligible for rehire' : 'Not eligible for rehire');

/**
 * The structured exit interview: why they're leaving, how they rate the
 * workplace, pay and growth, what they and their manager said, and whether
 * they'd be hired again. Confidential notes show only to HR who may see them.
 */
export const ExitInterviewPanel: React.FC<{ exit: ExitDetail; canRecord: boolean; onSave: (input: ExitInterviewInput) => Promise<void>; onChanged: (next: ExitDetail, message: string) => void }> = ({ exit, canRecord, onSave, onChanged }) => {
  const [reasons, setReasons] = useState<ExitReason[]>([]);
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const cancelBooking = async () => {
    setCancelling(true);
    setBookingError(null);
    try {
      onChanged(await offboardingApi.cancelInterviewBooking(exit.id), 'Booking cancelled; the employee and interviewer are told');
    } catch (e) {
      setBookingError(errorText(e));
    } finally {
      setCancelling(false);
    }
  };
  const canBook = canRecord && exit.status === 'IN_PROGRESS';
  useEffect(() => { offboardingApi.exitReasons().then(setReasons).catch(() => setReasons([])); }, []);
  const label = (code: string | null) => (code ? reasons.find((r) => r.code === code)?.label ?? code : null);
  const iv = exit.exitInterview;

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="interview-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="interview-heading" className="text-sm font-bold text-slate-900 dark:text-slate-100">Exit interview</h3>
        <div className="flex flex-wrap gap-2">
          {canBook && !iv && <Button size="sm" variant="outline" onClick={() => setBooking(true)}>{exit.interviewBooking ? 'Reschedule' : 'Book interview'}</Button>}
          {canRecord && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{iv ? 'Edit' : 'Record exit interview'}</Button>}
        </div>
      </div>
      {exit.interviewBooking && !iv && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-800/50 dark:bg-teal-950/30 dark:text-teal-100">
          <span>
            Booked for <strong>{new Date(exit.interviewBooking.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
            {exit.interviewBooking.interviewer?.name ? ` with ${exit.interviewBooking.interviewer.name}` : ''}{exit.interviewBooking.location ? `, ${exit.interviewBooking.location}` : ''}
          </span>
          {canRecord && <Button size="sm" variant="ghost" onClick={cancelBooking} loading={cancelling} disabled={cancelling}>Cancel booking</Button>}
        </div>
      )}
      {bookingError && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{bookingError}</p>}
      {iv ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">Held {day(iv.date)}{iv.conductedBy?.name ? ` by ${iv.conductedBy.name}` : ''}{iv.recordedBy && iv.recordedBy !== iv.conductedBy?.name ? ` · noted by ${iv.recordedBy}` : ''}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
              <dt className="text-xs text-slate-500">Main reason</dt>
              <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label(iv.primaryReason) ?? '—'}{iv.secondaryReason && <span className="font-normal text-slate-600 dark:text-slate-300"> · also {label(iv.secondaryReason)}</span>}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/5">
              <dt className="text-xs text-slate-500">Rehire</dt>
              <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rehireText(iv.rehireEligible)}{iv.rehireRemarks && <span className="block text-xs font-normal text-slate-600 dark:text-slate-300">{iv.rehireRemarks}</span>}</dd>
            </div>
          </dl>
          <dl className="grid grid-cols-3 gap-3">
            {RATINGS.map((r) => (
              <div key={r.key} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-[#2B293E]">
                <dt className="text-xs text-slate-500">{r.label}</dt>
                <dd className="text-sm font-semibold text-slate-900 dark:text-slate-100">{iv.ratings[r.key] ? `${iv.ratings[r.key]} of 5` : 'Not rated'}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">What the employee said</h4>
            <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-800 dark:text-slate-200">{iv.employeeFeedback}</p>
          </div>
          {exit.canSeeConfidential && iv.confidentialNotes && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
              <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Confidential: HR only</h4>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-amber-950 dark:text-amber-100">{iv.confidentialNotes}</p>
            </div>
          )}
        </div>
      ) : <p className="mt-2 text-sm text-slate-500">Not recorded yet. Note why they’re leaving, how they rate the workplace, and whether you’d hire them again.</p>}

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-[#2B293E]">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manager’s feedback</h4>
        {exit.managerFeedback
          ? <><p className="mt-1 whitespace-pre-line break-words text-sm text-slate-800 dark:text-slate-200">{exit.managerFeedback.text}</p><p className="text-xs text-slate-500">{exit.managerFeedback.by ?? 'The manager'}{exit.managerFeedback.at ? ` · ${new Date(exit.managerFeedback.at).toLocaleDateString()}` : ''}</p></>
          : <p className="mt-1 text-sm text-slate-500">Not given yet. The manager adds it from My team.</p>}
      </div>
      <p className="mt-3 text-xs text-slate-500">Only people who can view exits see the interview; the employee doesn’t.</p>

      {booking && <BookingDialog exit={exit} onClose={() => setBooking(false)} run={async (input) => { onChanged(await offboardingApi.scheduleInterview(exit.id, input), 'Interview booked; the employee and interviewer are emailed'); setBooking(false); }} />}
      {editing && <InterviewDialog exit={exit} reasons={reasons} onClose={() => setEditing(false)} run={async (input) => { await onSave(input); setEditing(false); }} />}
    </section>
  );
};

/** The local date and time in a browser date-time field: "2026-12-10T15:30". */
const localInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const BookingDialog: React.FC<{ exit: ExitDetail; onClose: () => void; run: (input: { scheduledAt: string; interviewerMemberId?: string; location?: string }) => Promise<void> }> = ({ exit, onClose, run }) => {
  const id = useId();
  const b = exit.interviewBooking;
  const [when, setWhen] = useState(b ? localInput(b.at) : '');
  const [interviewer, setInterviewer] = useState(b?.interviewer?.id ?? '');
  const [location, setLocation] = useState(b?.location ?? '');
  const [interviewers, setInterviewers] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { offboardingApi.interviewers().then(setInterviewers).catch(() => setInterviewers([])); }, []);
  // The browser's own time zone; sent with its offset so the server never guesses.
  const future = !!when && new Date(when).getTime() > Date.now();
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await run({ scheduledAt: new Date(when).toISOString(), interviewerMemberId: interviewer || undefined, location: location.trim() || undefined });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={b ? 'Reschedule the exit interview' : 'Book the exit interview'} description={`${exit.employee.name} and the interviewer are emailed${b ? ' the new time' : ''}.`} size="sm" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} loading={busy} disabled={busy || !future}>{b ? 'Reschedule' : 'Book'}</Button></>}>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${id}-when`} className={labelClass}>Date and time</label>
          <input id={`${id}-when`} type="datetime-local" className={fieldClass} value={when} onChange={(e) => setWhen(e.target.value)} aria-invalid={!!when && !future} />
          {when && !future && <p className="mt-1 text-xs text-red-700">Choose a time still to come.</p>}
        </div>
        <div>
          <label htmlFor={`${id}-interviewer`} className={labelClass}>Interviewer</label>
          <select id={`${id}-interviewer`} className={fieldClass} value={interviewer} onChange={(e) => setInterviewer(e.target.value)}>
            <option value="">Me</option>
            {interviewers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-location`} className={labelClass}>Room or meeting link <span className="font-normal text-slate-500">(optional)</span></label>
          <input id={`${id}-location`} className={fieldClass} maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} />
          <p className={hintClass}>Included in the email.</p>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Dialog>
  );
};

const InterviewDialog: React.FC<{ exit: ExitDetail; reasons: ExitReason[]; onClose: () => void; run: (input: ExitInterviewInput) => Promise<void> }> = ({ exit, reasons, onClose, run }) => {
  const id = useId();
  const iv = exit.exitInterview;
  const [date, setDate] = useState(iv?.date ?? exit.today);
  const [conductedBy, setConductedBy] = useState(iv?.conductedBy?.id ?? '');
  const [interviewers, setInterviewers] = useState<{ id: string; name: string }[]>([]);
  const [primary, setPrimary] = useState(iv?.primaryReason ?? '');
  const [secondary, setSecondary] = useState(iv?.secondaryReason ?? '');
  const [feedback, setFeedback] = useState(iv?.employeeFeedback ?? '');
  const [ratings, setRatings] = useState<Record<'workplace' | 'compensation' | 'growth', string>>({
    workplace: iv?.ratings.workplace?.toString() ?? '', compensation: iv?.ratings.compensation?.toString() ?? '', growth: iv?.ratings.growth?.toString() ?? '',
  });
  const [rehire, setRehire] = useState<'' | 'yes' | 'no'>(iv?.rehireEligible == null ? '' : iv.rehireEligible ? 'yes' : 'no');
  const [rehireRemarks, setRehireRemarks] = useState(iv?.rehireRemarks ?? '');
  const [confidential, setConfidential] = useState(iv?.confidentialNotes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { offboardingApi.interviewers().then(setInterviewers).catch(() => setInterviewers([])); }, []);
  // A reason switched off still shows where it was already chosen.
  const options = (current: string) => reasons.filter((r) => r.active || r.code === current);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const rating = (v: string) => (v ? Number(v) : undefined);
      await run({
        interviewDate: date, conductedByMemberId: conductedBy || undefined, primaryReason: primary, secondaryReason: secondary || undefined, employeeFeedback: feedback.trim(),
        workplaceRating: rating(ratings.workplace), compensationRating: rating(ratings.compensation), growthRating: rating(ratings.growth),
        rehireEligible: rehire === '' ? undefined : rehire === 'yes', rehireRemarks: rehireRemarks.trim() || undefined,
        // Sent only by those who may write them, so saving never clears them for anyone else.
        ...(exit.canSeeConfidential ? { confidentialNotes: confidential.trim() } : {}),
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const valid = !!date && date <= exit.today && !!primary && primary !== secondary && feedback.trim().length >= 3;

  return (
    <Dialog title="Exit interview" description={`What ${exit.employee.name} said about leaving. The employee doesn’t see this.`} size="lg" onClose={() => !busy && onClose()}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} loading={busy} disabled={busy || !valid}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-date`} className={labelClass}>Held on</label>
            <input id={`${id}-date`} type="date" className={fieldClass} max={exit.today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-by`} className={labelClass}>Held by</label>
            <select id={`${id}-by`} className={fieldClass} value={conductedBy} onChange={(e) => setConductedBy(e.target.value)}>
              <option value="">Me</option>
              {interviewers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-primary`} className={labelClass}>Main reason for leaving</label>
            <select id={`${id}-primary`} className={fieldClass} value={primary} onChange={(e) => setPrimary(e.target.value)}>
              <option value="" disabled>Choose…</option>
              {options(iv?.primaryReason ?? '').map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-secondary`} className={labelClass}>Other reason <span className="font-normal text-slate-500">(optional)</span></label>
            <select id={`${id}-secondary`} className={fieldClass} value={secondary} onChange={(e) => setSecondary(e.target.value)}>
              <option value="">None</option>
              {options(iv?.secondaryReason ?? '').filter((r) => r.code !== primary).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className={labelClass}>How they rate it <span className="font-normal text-slate-500">(1 poor, 5 excellent; optional)</span></legend>
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {RATINGS.map((r) => (
              <div key={r.key}>
                <label htmlFor={`${id}-${r.key}`} className="text-xs text-slate-600 dark:text-slate-400">{r.label}</label>
                <select id={`${id}-${r.key}`} className={fieldClass} value={ratings[r.key]} onChange={(e) => setRatings({ ...ratings, [r.key]: e.target.value })}>
                  <option value="">Not rated</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${id}-feedback`} className={labelClass}>What the employee said</label>
          <textarea id={`${id}-feedback`} className={fieldClass} rows={5} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <p className={hintClass}>{4000 - feedback.length} characters left.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-rehire`} className={labelClass}>Would you hire them again?</label>
            <select id={`${id}-rehire`} className={fieldClass} value={rehire} onChange={(e) => setRehire(e.target.value as '' | 'yes' | 'no')}>
              <option value="">Not decided</option>
              <option value="yes">Yes, eligible for rehire</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-rehire-remarks`} className={labelClass}>Rehire remarks <span className="font-normal text-slate-500">(optional)</span></label>
            <input id={`${id}-rehire-remarks`} className={fieldClass} maxLength={1000} value={rehireRemarks} onChange={(e) => setRehireRemarks(e.target.value)} />
          </div>
        </div>

        {exit.canSeeConfidential && (
          <div>
            <label htmlFor={`${id}-confidential`} className={labelClass}>Confidential notes <span className="font-normal text-slate-500">(HR only, optional)</span></label>
            <textarea id={`${id}-confidential`} className={fieldClass} rows={3} maxLength={4000} value={confidential} onChange={(e) => setConfidential(e.target.value)} />
            <p className={hintClass}>Only HR with access to confidential notes sees these; other people who view exits don’t.</p>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Dialog>
  );
};
