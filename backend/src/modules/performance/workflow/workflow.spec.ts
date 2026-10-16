import { Prisma } from '@prisma/client';
import { StageDef, validateWorkflow, WorkflowDef } from './workflow-definition';
import { combineReviewers, combineStages, currentStep, returnTarget, stageProgress, stageRates } from './workflow-engine';

const D = (v: string) => new Prisma.Decimal(v);

const stage = (key: string, extra: Partial<StageDef> = {}): StageDef => ({
  key, name: key, step: 1, source: 'REPORTING_MANAGER', mode: 'EACH', action: 'RATE', minReviewers: 1, maxReviewers: 1, completion: 'ALL', minCompleted: null,
  aggregation: 'AVERAGE', scoreWeight: null, ratedScope: 'ALL', kraIds: [], memberIds: [], roleId: null, nominatedBy: null, nominationNeedsApproval: false,
  allowsDecline: false, allowsReplacement: true, returnRule: 'NONE', dueDays: 14, reminderDays: [], escalateAfterDays: null, escalateTo: 'NONE', escalationRoleId: null,
  employeeSees: 'INDIVIDUAL_AFTER_FINALIZATION', identity: 'VISIBLE', laterStagesSee: 'INDIVIDUAL', ...extra,
});

/** Self → manager and peers side by side → HR approval. */
const standard = (): WorkflowDef => ({
  resolution: 'AT_LAUNCH',
  allowRepeatReviewers: false,
  stages: [
    stage('self', { source: 'SELF', scoreWeight: D('10') }),
    stage('manager', { step: 2, scoreWeight: D('70'), returnRule: 'SELF_ASSESSMENT', reminderDays: [3, 1], escalateTo: 'DEPARTMENT_HEAD', escalateAfterDays: 2 }),
    stage('peers', {
      step: 2, source: 'NOMINATED', nominatedBy: 'EMPLOYEE', nominationNeedsApproval: true, minReviewers: 2, maxReviewers: 5, completion: 'AT_LEAST', minCompleted: 2,
      scoreWeight: D('20'), ratedScope: 'SELECTED_KRAS', kraIds: ['teamwork'], identity: 'HIDDEN_FROM_EMPLOYEE', employeeSees: 'AGGREGATE_AFTER_FINALIZATION', allowsDecline: true,
    }),
    stage('hr', { step: 3, source: 'ROLE_MEMBERS', roleId: 'hr-role', mode: 'POOL', maxReviewers: 3, completion: 'AT_LEAST', minCompleted: 1, action: 'APPROVE', returnRule: 'ANY_EARLIER' }),
  ],
});
const paths = (def: WorkflowDef) => validateWorkflow(def).map((p) => p.path);

describe('workflow rules', () => {
  it('accepts self → manager + peers side by side → HR approval', () => {
    expect(validateWorkflow(standard())).toEqual([]);
  });

  it('needs counted stages to total 100% and someone other than the employee to rate', () => {
    const def = standard();
    def.stages[1].scoreWeight = D('60');
    expect(validateWorkflow(def).map((p) => p.message)).toContain('The stages that count toward the final score add up to 90%, not 100%.');
    expect(validateWorkflow({ ...def, stages: [stage('self', { source: 'SELF', scoreWeight: D('100') })] }).map((p) => p.message))
      .toContain('Add at least one stage where someone other than the employee rates.');
  });

  it('checks reviewer counts against what completion needs', () => {
    const def = standard();
    def.stages[2] = { ...def.stages[2], minReviewers: 1, minCompleted: 2 };
    def.stages[1] = { ...def.stages[1], maxReviewers: 2 };
    expect(paths(def)).toEqual(expect.arrayContaining(['stages.2.minCompleted', 'stages.1.maxReviewers']));
  });

  it('keeps steps in order without gaps, and final approval last', () => {
    const def = standard();
    def.stages[3].step = 4;
    expect(paths(def)).toContain('stages');
    const early = standard();
    early.stages[3].step = 2;
    expect(paths(early)).toContain('stages.3.step');
  });

  it('only promises anonymity it can keep', () => {
    const shown = standard();
    shown.stages[2].employeeSees = 'INDIVIDUAL_AFTER_FINALIZATION';
    expect(paths(shown)).toContain('stages.2.employeeSees');
    const single = standard();
    single.stages[2] = { ...single.stages[2], minReviewers: 1, minCompleted: 1 };
    expect(paths(single)).toContain('stages.2.minCompleted');
    const manager = standard();
    manager.stages[1].identity = 'HIDDEN_FROM_EMPLOYEE';
    expect(paths(manager)).toContain('stages.1.identity');
  });

  it('only sends back where there is something earlier to send back to', () => {
    const def = standard();
    def.stages[0].returnRule = 'PREVIOUS_STEP';
    expect(paths(def)).toContain('stages.0.returnRule');
    const noSelf = standard();
    noSelf.stages.shift();
    noSelf.stages.forEach((s) => { s.step -= 1; });
    noSelf.stages[0].scoreWeight = D('80');
    expect(paths(noSelf)).toContain('stages.0.returnRule');
  });

  it('checks reminders and escalation', () => {
    const def = standard();
    def.stages[1] = { ...def.stages[1], reminderDays: [14, 3, 3], escalateTo: 'ROLE', escalationRoleId: null };
    expect(paths(def)).toEqual(expect.arrayContaining(['stages.1.reminderDays', 'stages.1.escalationRoleId']));
  });
});

describe('workflow progress', () => {
  const def = standard();
  const [self, manager, peers, hr] = def.stages;

  it('advances step by step, waiting for every stage of a step', () => {
    expect(currentStep(def, {})?.step).toBe(1);
    const afterSelf = { self: [{ reviewerId: 'emp', status: 'SUBMITTED' as const }] };
    expect(currentStep(def, afterSelf)?.step).toBe(2);
    const managerDone = { ...afterSelf, manager: [{ reviewerId: 'm', status: 'SUBMITTED' as const }], peers: [{ reviewerId: 'p1', status: 'SUBMITTED' as const }, { reviewerId: 'p2', status: 'ASSIGNED' as const }] };
    const step = currentStep(def, managerDone);
    expect(step?.step).toBe(2);
    expect(step?.stages.map((s) => [s.stage.key, s.progress.status])).toEqual([['manager', 'COMPLETE'], ['peers', 'IN_PROGRESS']]);
    const all = { ...managerDone, peers: [{ reviewerId: 'p1', status: 'SUBMITTED' as const }, { reviewerId: 'p2', status: 'SUBMITTED' as const }], hr: [{ reviewerId: 'h1', status: 'SUBMITTED' as const }, { reviewerId: 'h2', status: 'ASSIGNED' as const }] };
    expect(currentStep(def, all)).toBeNull();
  });

  it('counts a reviewer once, however often they appear', () => {
    expect(stageProgress(peers, [{ reviewerId: 'p1', status: 'SUBMITTED' }, { reviewerId: 'p1', status: 'ASSIGNED' }, { reviewerId: 'p2', status: 'ASSIGNED' }]))
      .toMatchObject({ status: 'IN_PROGRESS', submitted: 1, required: 2 });
  });

  it('asks for replacements when declines leave too few, and is stuck when it may not replace them', () => {
    const declined: { reviewerId: string; status: 'SUBMITTED' | 'DECLINED' | 'ASSIGNED' }[] = [{ reviewerId: 'p1', status: 'SUBMITTED' }, { reviewerId: 'p2', status: 'DECLINED' }];
    expect(stageProgress(peers, declined)).toMatchObject({ status: 'NEEDS_REVIEWERS', reason: '1 more reviewer needed' });
    expect(stageProgress({ ...peers, allowsReplacement: false }, declined).status).toBe('STUCK');
    expect(stageProgress(manager, [])).toMatchObject({ status: 'NEEDS_REVIEWERS' });
    expect(stageProgress(hr, [{ reviewerId: 'h1', status: 'ASSIGNED' }, { reviewerId: 'h2', status: 'SUBMITTED' }]).status).toBe('COMPLETE');
    expect(stageProgress(self, [{ reviewerId: 'emp', status: 'SUBMITTED' }]).status).toBe('COMPLETE');
  });

  it('sends back only as each stage allows', () => {
    expect(returnTarget(def, 'manager', 'self')).toEqual({ step: 1 });
    expect(returnTarget(def, 'hr', 'manager')).toEqual({ step: 2 });
    expect(returnTarget(def, 'peers', 'self')).toEqual({ problem: 'peers can’t send the appraisal back.' });
    expect(returnTarget(def, 'manager', 'hr')).toEqual({ problem: 'An appraisal can only be sent back to an earlier step.' });
  });
});

describe('combining ratings', () => {
  it('combines a stage’s reviewers by average, median or the lead reviewer', () => {
    const scores = [{ reviewerId: 'a', percent: D('80') }, { reviewerId: 'b', percent: D('60'), lead: true }, { reviewerId: 'c', percent: D('100') }];
    expect(combineReviewers({ name: 'Peers', aggregation: 'AVERAGE' }, scores)).toEqual({ percent: D('80'), step: 'Peers: average of 80%, 60%, 100% = 80%' });
    expect(combineReviewers({ name: 'Peers', aggregation: 'MEDIAN' }, scores)?.percent.toString()).toBe('80');
    expect(combineReviewers({ name: 'Peers', aggregation: 'MEDIAN' }, scores.slice(0, 2))?.percent.toString()).toBe('70');
    expect(combineReviewers({ name: 'Peers', aggregation: 'LEAD_REVIEWER' }, scores)?.percent.toString()).toBe('60');
    expect(combineReviewers({ name: 'Peers', aggregation: 'AVERAGE' }, [])).toBeNull();
  });

  it('weights stages by their share, giving a missing stage’s share to the others', () => {
    const def = standard();
    const teamwork = combineStages(def, 'Teamwork', { self: D('100'), manager: D('80'), peers: D('60') });
    // (10×100 + 70×80 + 20×60) ÷ 100 = 78
    expect(teamwork.percent?.toString()).toBe('78');
    const revenue = combineStages(def, 'Revenue', { self: D('100'), manager: D('80'), peers: null });
    // Peers didn't rate revenue: (10×100 + 70×80) ÷ 80 = 82.5
    expect(revenue.percent?.toString()).toBe('82.5');
    expect(revenue.steps[1]).toBe('peers didn’t rate this, so the others share its weight.');
  });

  it('knows which lines each stage rates', () => {
    const [, manager, peers, hr] = standard().stages;
    expect(stageRates(manager, { kind: 'KRA_ITEM', kraId: 'sales' })).toBe(true);
    expect(stageRates(peers, { kind: 'KRA_ITEM', kraId: 'sales' })).toBe(false);
    expect(stageRates(peers, { kind: 'KRA_ITEM', kraId: 'teamwork' })).toBe(true);
    expect(stageRates(hr, { kind: 'QUESTION' })).toBe(false);
  });
});
