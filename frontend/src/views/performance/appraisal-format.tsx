import type { AppraisalStatus, AssignmentStatus, CycleKind, CycleStatus, StageStatus } from '../../api/appraisals.api';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

/** Statuses as words with a badge colour; the words carry the meaning, the colour only helps. */
export const STAGE_STATUS: Record<StageStatus, { label: string; variant: Variant }> = {
  WAITING: { label: 'Waiting', variant: 'neutral' },
  OPEN: { label: 'Open', variant: 'info' },
  NEEDS_REVIEWERS: { label: 'Needs reviewers', variant: 'warning' },
  COMPLETE: { label: 'Complete', variant: 'success' },
};

export const APPRAISAL_STATUS: Record<AppraisalStatus, { label: string; variant: Variant }> = {
  IN_PROGRESS: { label: 'In progress', variant: 'info' },
  REVIEWS_COMPLETE: { label: 'Reviews complete', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
};

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, { label: string; variant: Variant }> = {
  ASSIGNED: { label: 'To do', variant: 'info' },
  SUBMITTED: { label: 'Submitted', variant: 'success' },
  DECLINED: { label: 'Declined', variant: 'warning' },
  REPLACED: { label: 'Replaced', variant: 'neutral' },
  CANCELLED: { label: 'Not needed', variant: 'neutral' },
  RETURNED: { label: 'Sent back', variant: 'warning' },
};

export const CYCLE_STATUS: Record<CycleStatus, { label: string; variant: Variant }> = {
  DRAFT: { label: 'Not launched', variant: 'warning' },
  ACTIVE: { label: 'Running', variant: 'info' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  ARCHIVED: { label: 'Archived', variant: 'neutral' },
};

export const CYCLE_KIND: Record<CycleKind, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-yearly',
  ANNUAL: 'Annual',
  PROBATION: 'Probation',
  PROJECT: 'Project',
  CUSTOM: 'Custom',
};
