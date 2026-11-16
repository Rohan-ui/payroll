/**
 * The candidate workflow. A status changes in one of three ways:
 *
 * - by hand, only along the MANUAL moves below (screening a new candidate,
 *   rejecting early, a candidate withdrawing);
 * - by the action that causes it (scheduling an interview, completing one,
 *   deciding on one, and later sending an offer, collecting documents and
 *   converting to an employee), which the services apply themselves;
 * - by an override, which needs its own permission and a written reason, and
 *   is recorded as one.
 *
 * The database also refuses any status not listed here.
 */

export const CANDIDATE_STATUSES = [
  'NEW',
  'FORM_SENT',
  'FORM_SUBMITTED',
  'SCREENING',
  'ELIGIBLE',
  'NOT_ELIGIBLE',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'SELECTED',
  'REJECTED',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'OFFER_DECLINED',
  'DOCUMENT_COLLECTION',
  'VERIFICATION',
  'READY_TO_JOIN',
  'JOINED',
  'WITHDRAWN',
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  NEW: 'New',
  FORM_SENT: 'Form sent',
  FORM_SUBMITTED: 'Form submitted',
  SCREENING: 'Under review',
  ELIGIBLE: 'Eligible',
  NOT_ELIGIBLE: 'Not eligible',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  INTERVIEW_COMPLETED: 'Interview completed',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
  OFFER_SENT: 'Offer released',
  OFFER_ACCEPTED: 'Offer accepted',
  OFFER_DECLINED: 'Offer declined',
  DOCUMENT_COLLECTION: 'Document collection',
  VERIFICATION: 'Verification',
  READY_TO_JOIN: 'Ready to join',
  JOINED: 'Converted to employee',
  WITHDRAWN: 'Withdrawn',
};

/** Statuses a candidate leaves only by override: the process has ended for them. */
export const CLOSED_STATUSES: readonly CandidateStatus[] = ['REJECTED', 'NOT_ELIGIBLE', 'OFFER_DECLINED', 'JOINED', 'WITHDRAWN'];

/** Moves someone may make by hand. Everything else happens through its own action. */
const MANUAL_MOVES: Record<CandidateStatus, readonly CandidateStatus[]> = {
  NEW: ['SCREENING', 'REJECTED', 'WITHDRAWN'],
  FORM_SENT: ['REJECTED', 'WITHDRAWN'],
  FORM_SUBMITTED: ['SCREENING', 'WITHDRAWN'],
  SCREENING: ['REJECTED', 'WITHDRAWN'],
  ELIGIBLE: ['WITHDRAWN'],
  NOT_ELIGIBLE: [],
  INTERVIEW_SCHEDULED: ['WITHDRAWN'],
  INTERVIEW_COMPLETED: ['WITHDRAWN'],
  SELECTED: ['OFFER_SENT', 'DOCUMENT_COLLECTION', 'READY_TO_JOIN', 'REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  OFFER_SENT: ['OFFER_ACCEPTED', 'OFFER_DECLINED', 'DOCUMENT_COLLECTION', 'REJECTED', 'WITHDRAWN'],
  OFFER_ACCEPTED: ['DOCUMENT_COLLECTION', 'VERIFICATION', 'READY_TO_JOIN', 'WITHDRAWN'],
  OFFER_DECLINED: [],
  DOCUMENT_COLLECTION: ['VERIFICATION', 'READY_TO_JOIN', 'REJECTED', 'WITHDRAWN'],
  VERIFICATION: ['DOCUMENT_COLLECTION', 'READY_TO_JOIN', 'REJECTED', 'WITHDRAWN'],
  READY_TO_JOIN: ['REJECTED', 'WITHDRAWN'],
  JOINED: [],
  WITHDRAWN: [],
};

/** How a status is reached when it is not a hand move, for explaining a refusal. */
const REACHED_BY: Partial<Record<CandidateStatus, string>> = {
  FORM_SENT: 'Send the candidate their information form.',
  FORM_SUBMITTED: 'This happens when the candidate submits their form.',
  ELIGIBLE: 'Record an eligibility decision.',
  NOT_ELIGIBLE: 'Record an eligibility decision.',
  INTERVIEW_SCHEDULED: 'Schedule an interview for the candidate.',
  INTERVIEW_COMPLETED: 'Mark the interview completed, or record feedback on it.',
  SELECTED: 'Record a "select" decision on a completed interview.',
  OFFER_SENT: 'This happens when an offer is sent.',
  OFFER_ACCEPTED: 'This happens when the candidate accepts the offer.',
  OFFER_DECLINED: 'This happens when the candidate declines the offer.',
  DOCUMENT_COLLECTION: 'This happens when document collection starts.',
  VERIFICATION: 'This happens when the documents are submitted for verification.',
  READY_TO_JOIN: 'This happens when the documents are verified.',
  JOINED: 'This happens when the candidate is converted to an employee.',
};

export function isCandidateStatus(value: unknown): value is CandidateStatus {
  return typeof value === 'string' && (CANDIDATE_STATUSES as readonly string[]).includes(value);
}

export function manualMoves(from: CandidateStatus): readonly CandidateStatus[] {
  return MANUAL_MOVES[from];
}

/** Why a hand move is not allowed, or null when it is. */
export function refuseManualMove(from: CandidateStatus, to: CandidateStatus): string | null {
  if (from === to) return `The candidate is already ${CANDIDATE_STATUS_LABELS[to].toLowerCase()}.`;
  if (MANUAL_MOVES[from].includes(to)) return null;
  const how = REACHED_BY[to];
  return `A candidate who is ${CANDIDATE_STATUS_LABELS[from].toLowerCase()} can't be moved to ${CANDIDATE_STATUS_LABELS[to].toLowerCase()} by hand.${how ? ` ${how}` : ''} An override with a reason is also possible.`;
}

/** Why an override is not allowed, or null when it is. JOINED is reached, and left, only through the employee record. */
export function refuseOverride(from: CandidateStatus, to: CandidateStatus): string | null {
  if (from === to) return `The candidate is already ${CANDIDATE_STATUS_LABELS[to].toLowerCase()}.`;
  if (to === 'JOINED') return 'A candidate joins only by being converted to an employee.';
  if (from === 'JOINED') return 'This candidate is already an employee; change the employee record instead.';
  return null;
}

/** Statuses from which an interview may be scheduled. */
export const SCHEDULABLE_FROM: readonly CandidateStatus[] = ['SCREENING', 'ELIGIBLE', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED'];

/** Statuses from which the candidate information form may be sent (again, to ask for more). */
export const FORM_SENDABLE_FROM: readonly CandidateStatus[] = ['NEW', 'FORM_SENT', 'FORM_SUBMITTED', 'SCREENING'];

/** Statuses in which an eligibility decision may be recorded. */
export const ELIGIBILITY_FROM: readonly CandidateStatus[] = ['NEW', 'FORM_SUBMITTED', 'SCREENING'];
