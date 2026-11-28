import { describe, expect, it } from 'vitest';
import { CANDIDATE_STATUSES } from '../../api/onboarding.api';
import { CLOSED_STAGES, PHASES } from './OnboardingDashboard';

describe('dashboard pipeline phases', () => {
  it('puts every candidate stage in exactly one phase or in closed', () => {
    const placed = [...PHASES.flatMap((p) => p.stages), ...CLOSED_STAGES];
    expect([...placed].sort()).toEqual([...CANDIDATE_STATUSES].sort());
  });
});
