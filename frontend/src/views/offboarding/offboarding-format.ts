import type { ClearanceStatus, ClearanceTeam, SeparationStatus, SeparationType } from '../../api/offboarding.api';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const EXIT_TYPE: Record<SeparationType, string> = {
  RESIGNATION: 'Resignation',
  TERMINATION: 'Termination',
  RETIREMENT: 'Retirement',
  CONTRACT_END: 'Contract end',
};

export const EXIT_STATUS: Record<SeparationStatus, { label: string; variant: Variant }> = {
  PENDING_APPROVAL: { label: 'Awaiting acceptance', variant: 'warning' },
  IN_PROGRESS: { label: 'Serving notice', variant: 'info' },
  COMPLETED: { label: 'Exited', variant: 'neutral' },
  WITHDRAWN: { label: 'Withdrawn', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
};

export const TEAM: Record<ClearanceTeam, string> = {
  MANAGER: 'Manager',
  IT: 'IT',
  ADMIN: 'Admin',
  FINANCE: 'Finance',
  HR: 'HR',
};

export const ITEM_STATUS: Record<ClearanceStatus, { label: string; variant: Variant }> = {
  PENDING: { label: 'Open', variant: 'warning' },
  CLEARED: { label: 'Cleared', variant: 'success' },
  WAIVED: { label: 'Waived', variant: 'neutral' },
};

/** YYYY-MM-DD `days` after a YYYY-MM-DD date. */
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Whole days from one YYYY-MM-DD date to another. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
