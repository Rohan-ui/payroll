/**
 * Which payroll policy covers an employee, when their salary doesn't name one.
 *
 * A policy covers an employee when, for every kind of scope it has
 * (department, branch, employment type, designation), the employee's
 * employment matches one of its rows. The policy naming the most kinds wins;
 * two equally specific policies are a problem to fix, never a coin toss.
 * Otherwise the workspace's default policy applies.
 */

export const SCOPE_KINDS = ['department', 'branch', 'employmentType', 'designation'] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];

export interface PolicyCandidate {
  id: string;
  name: string;
  isDefault: boolean;
  scopes: { kind: ScopeKind; refId: string }[];
}

export type EmploymentPlacement = Record<ScopeKind, string | null>;

export type PolicyChoice = { policyId: string; reason: string } | { problem: string };

export function choosePolicy(candidates: PolicyCandidate[], placement: EmploymentPlacement | null): PolicyChoice {
  const matches: { policy: PolicyCandidate; kinds: number }[] = [];
  for (const policy of candidates) {
    if (!policy.scopes.length || !placement) continue;
    const kinds = SCOPE_KINDS.filter((k) => policy.scopes.some((s) => s.kind === k));
    const covers = kinds.every((k) => placement[k] !== null && policy.scopes.some((s) => s.kind === k && s.refId === placement[k]));
    if (covers) matches.push({ policy, kinds: kinds.length });
  }
  if (matches.length) {
    const best = Math.max(...matches.map((m) => m.kinds));
    const top = matches.filter((m) => m.kinds === best);
    if (top.length > 1) {
      return { problem: `More than one payroll policy covers this employee equally (${top.map((m) => m.policy.name).sort().join(', ')}). Narrow their scopes, or name a policy on the employee’s salary.` };
    }
    return { policyId: top[0].policy.id, reason: 'Covers the employee’s department, branch, employment type or designation' };
  }
  const fallback = candidates.find((p) => p.isDefault);
  if (fallback) return { policyId: fallback.id, reason: 'The workspace’s default policy' };
  return { problem: 'No payroll policy covers this employee. Set a default policy, or name one on the employee’s salary.' };
}
