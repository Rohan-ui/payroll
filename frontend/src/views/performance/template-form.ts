import type {
  Direction, EmployeeVisibility, FieldType, FilledBy, Kpi, Kra, KraKpi, MeasurementType, MissingRule, ScoringMethod, ScoringModel, TargetSource, TemplateDraft, TemplateVersion, WeightRule,
} from '../../api/performance.api';

/**
 * The template editor's form: a draft as people edit it (every number a
 * string as typed), with the labels and starting values it offers. The server
 * checks everything again; what is listed here only decides what is offered.
 */

export const MODEL: Record<ScoringModel, { label: string; hint: string }> = {
  WEIGHTED: { label: 'Weighted percentages', hint: 'Each KRA has a weight in the appraisal and each KPI a weight within its KRA. Scores are percentages.' },
  MARKS: { label: 'Marks', hint: 'Each KRA and KPI is worth a number of marks, which are also its weight. The result is shown in marks and as a percentage.' },
};

export const WEIGHT_RULE: Record<WeightRule, { label: string; hint: string }> = {
  MUST_TOTAL: { label: 'Must add up exactly', hint: 'Weights must total 100% (or marks the total). Nothing is adjusted for you; the template can’t be published until they do.' },
  NORMALIZE: { label: 'Share out in proportion', hint: 'Weights don’t have to add up: each counts as its share of the total given. The scoring shows the share each one gets.' },
};

export const MISSING_RULE: Record<MissingRule, { label: string; hint: string }> = {
  BLOCK: { label: 'Hold the score back', hint: 'No final score until every line is rated.' },
  EXCLUDE: { label: 'Leave the line out', hint: 'Unrated lines are left out and the rest share their weight.' },
  ZERO: { label: 'Count it as 0%', hint: 'An unrated line scores nothing.' },
};

export const METHOD: Record<ScoringMethod, { label: string; hint: string }> = {
  PERCENT_OF_TARGET: { label: 'Percentage of target', hint: 'Actual ÷ target × 100, up to 100%. For lower-is-better, target ÷ actual.' },
  LINEAR_BETWEEN: { label: 'Between threshold, target and stretch', hint: 'Scores you set at the threshold, target and stretch target, and in proportion between them.' },
  SLABS: { label: 'Score slabs', hint: 'Ranges of the result (or of achievement against target), each with a score.' },
  COMPLETION_PERCENT: { label: 'Completion percentage', hint: 'The percentage completed is the score.' },
  YES_NO: { label: 'Yes or no', hint: 'A score for yes and a score for no.' },
  RATING_SCALE: { label: 'Rating scale', hint: 'Rated on a rating scale, which turns the rating into a score.' },
  DIRECT_MARKS: { label: 'Marks given', hint: 'Marks out of the maximum marks.' },
  MANUAL: { label: 'Score given by hand', hint: 'A percentage given by the reviewer, who must say why.' },
};

const MEASURED: ScoringMethod[] = ['PERCENT_OF_TARGET', 'LINEAR_BETWEEN', 'SLABS', 'RATING_SCALE', 'DIRECT_MARKS', 'MANUAL'];
/** The methods each kind of measurement can be scored by (the server holds the same list). */
export const METHODS_FOR: Record<MeasurementType, ScoringMethod[]> = {
  NUMERIC: MEASURED, CURRENCY: MEASURED, COUNT: MEASURED, DURATION: MEASURED, QUALITY_SCORE: MEASURED,
  PERCENTAGE: [...MEASURED, 'COMPLETION_PERCENT'], MILESTONE: [...MEASURED, 'COMPLETION_PERCENT'],
  YES_NO: ['YES_NO', 'MANUAL'], RATING: ['RATING_SCALE'], QUALITATIVE: ['RATING_SCALE'],
};
export const DIRECT_METHODS: ScoringMethod[] = ['RATING_SCALE', 'DIRECT_MARKS', 'MANUAL'];
export const TARGET_METHODS: ScoringMethod[] = ['PERCENT_OF_TARGET', 'LINEAR_BETWEEN', 'SLABS'];

export const FIELD_TYPE: Record<FieldType, string> = {
  RATING: 'Rating',
  NUMBER: 'Number',
  SHORT_TEXT: 'Short answer',
  LONG_TEXT: 'Long answer',
  YES_NO: 'Yes / no',
  DROPDOWN: 'Choose one',
  MULTI_SELECT: 'Choose several',
  DATE: 'Date',
  ATTACHMENT: 'File upload',
  ACHIEVEMENTS: 'Achievements summary',
  DEVELOPMENT_GOAL: 'Development goal',
};
export const FILLED_BY: Record<FilledBy, string> = { SELF: 'The employee', REVIEWERS: 'Reviewers', BOTH: 'Both' };
export const VISIBILITY: Record<EmployeeVisibility, string> = {
  ALWAYS: 'Always', AFTER_FINALIZATION: 'Once the appraisal is finalized', NEVER: 'Never',
};

/** The settings each method starts with (matches the server's defaults). */
export function defaultConfig(method: ScoringMethod): Record<string, unknown> {
  if (method === 'LINEAR_BETWEEN') return { belowThresholdScore: '0', thresholdScore: '50', targetScore: '100', stretchScore: '100' };
  if (method === 'SLABS') {
    return { basis: 'ACHIEVEMENT_PERCENT', slabs: [{ from: '0', to: '60', scorePercent: '0' }, { from: '60', to: '90', scorePercent: '60' }, { from: '90', to: '100', scorePercent: '80' }, { from: '100', to: null, scorePercent: '100' }] };
  }
  if (method === 'YES_NO') return { yesScore: '100', noScore: '0' };
  return {};
}

export function defaultFieldConfig(type: FieldType): Record<string, unknown> {
  if (type === 'NUMBER') return { min: null, max: null, decimals: 0 };
  if (type === 'SHORT_TEXT') return { maxLength: 200 };
  if (type === 'LONG_TEXT' || type === 'ACHIEVEMENTS' || type === 'DEVELOPMENT_GOAL') return { maxLength: 2000 };
  if (type === 'DROPDOWN' || type === 'MULTI_SELECT') return { options: ['Option 1', 'Option 2'] };
  if (type === 'ATTACHMENT') return { maxFiles: 3 };
  return {};
}

export interface KpiForm {
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  measurementType: MeasurementType;
  direction: Direction;
  unitLabel: string | null;
  weightPercent: string;
  maxMarks: string;
  scoringMethod: ScoringMethod;
  scoringConfig: Record<string, unknown>;
  targetSource: TargetSource;
  target: string;
  threshold: string;
  stretch: string;
  ratingScaleId: string | null;
  allowsExemption: boolean;
}

export interface KraForm {
  kraId: string;
  kraCode: string;
  kraName: string;
  weightPercent: string;
  maxMarks: string;
  minMarks: string;
  scoringMethod: ScoringMethod | null;
  ratingScaleId: string | null;
  allowsExemption: boolean;
  kpis: KpiForm[];
}

export interface FieldForm {
  key: string;
  type: FieldType;
  label: string;
  description: string;
  required: boolean;
  filledBy: FilledBy;
  visibility: EmployeeVisibility;
  config: Record<string, unknown>;
  ratingScaleId: string | null;
  scored: boolean;
  weightPercent: string;
  maxMarks: string;
}

export interface DraftForm {
  scoringModel: ScoringModel;
  weightRule: WeightRule;
  totalMarks: string;
  missingRatingRule: MissingRule;
  scoreDecimals: number;
  finalScaleId: string | null;
  kras: KraForm[];
  fields: FieldForm[];
  changeNote: string;
}

export const EMPTY_DRAFT: DraftForm = {
  scoringModel: 'WEIGHTED', weightRule: 'MUST_TOTAL', totalMarks: '', missingRatingRule: 'BLOCK', scoreDecimals: 2, finalScaleId: null, kras: [], fields: [], changeNote: '',
};

const str = (value: string | null | undefined) => value ?? '';
const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export function formOf(v: TemplateVersion): DraftForm {
  return {
    scoringModel: v.policy.scoringModel,
    weightRule: v.policy.weightRule,
    totalMarks: str(v.policy.totalMarks),
    missingRatingRule: v.policy.missingRatingRule,
    scoreDecimals: v.policy.scoreDecimals,
    finalScaleId: v.policy.finalScale?.scaleId ?? null,
    changeNote: v.status === 'DRAFT' ? str(v.changeNote) : '',
    kras: v.kras.map((k) => ({
      kraId: k.kraId, kraCode: k.kraCode, kraName: k.kraName, weightPercent: str(k.weightPercent), maxMarks: str(k.maxMarks), minMarks: str(k.minMarks),
      scoringMethod: k.scoringMethod, ratingScaleId: k.ratingScale?.scaleId ?? null, allowsExemption: k.allowsExemption,
      kpis: k.kpis.map((p) => ({
        kpiId: p.kpiId, kpiCode: p.kpiCode, kpiName: p.kpiName, measurementType: p.measurementType, direction: p.direction, unitLabel: p.unitLabel,
        weightPercent: str(p.weightPercent), maxMarks: str(p.maxMarks), scoringMethod: p.scoringMethod, scoringConfig: p.scoringConfig, targetSource: p.targetSource,
        target: str(p.target), threshold: str(p.threshold), stretch: str(p.stretch), ratingScaleId: p.ratingScale?.scaleId ?? null, allowsExemption: p.allowsExemption,
      })),
    })),
    fields: v.fields.map((f) => ({
      key: f.key, type: f.type, label: f.label, description: str(f.description), required: f.required, filledBy: f.filledBy, visibility: f.visibility,
      config: f.config, ratingScaleId: f.ratingScale?.scaleId ?? null, scored: f.scored, weightPercent: str(f.weightPercent), maxMarks: str(f.maxMarks),
    })),
  };
}

/**
 * The draft to send. Only the weight the scoring model uses is sent (a
 * percentage, or marks), and a question that doesn't count sends none.
 */
export function draftOf(form: DraftForm): TemplateDraft {
  const marks = form.scoringModel === 'MARKS';
  const weight = (w: string) => (marks ? null : orNull(w));
  const max = (m: string, needed: boolean) => (marks || needed ? orNull(m) : null);
  return {
    scoringModel: form.scoringModel,
    weightRule: form.weightRule,
    totalMarks: marks ? orNull(form.totalMarks) : null,
    missingRatingRule: form.missingRatingRule,
    scoreDecimals: form.scoreDecimals,
    finalScaleId: form.finalScaleId,
    changeNote: form.changeNote.trim() || undefined,
    kras: form.kras.map((k) => {
      const direct = k.kpis.length === 0;
      return {
        kraId: k.kraId,
        weightPercent: weight(k.weightPercent),
        maxMarks: max(k.maxMarks, direct && (k.scoringMethod === 'DIRECT_MARKS' || k.scoringMethod === 'RATING_SCALE')),
        minMarks: direct && k.scoringMethod === 'DIRECT_MARKS' ? orNull(k.minMarks) : null,
        scoringMethod: direct ? k.scoringMethod : null,
        ratingScaleId: direct && k.scoringMethod === 'RATING_SCALE' ? k.ratingScaleId : null,
        allowsExemption: k.allowsExemption,
        kpis: k.kpis.map((p) => {
          const targets = TARGET_METHODS.includes(p.scoringMethod);
          return {
            kpiId: p.kpiId,
            weightPercent: weight(p.weightPercent),
            maxMarks: max(p.maxMarks, p.scoringMethod === 'DIRECT_MARKS' || p.scoringMethod === 'RATING_SCALE'),
            scoringMethod: p.scoringMethod,
            scoringConfig: p.scoringConfig,
            targetSource: p.targetSource,
            target: targets ? orNull(p.target) : null,
            threshold: targets ? orNull(p.threshold) : null,
            stretch: targets ? orNull(p.stretch) : null,
            ratingScaleId: p.scoringMethod === 'RATING_SCALE' ? p.ratingScaleId : null,
            allowsExemption: p.allowsExemption,
          };
        }),
      };
    }),
    fields: form.fields.map((f) => ({
      key: f.key, type: f.type, label: f.label.trim(), description: orNull(f.description), required: f.required, filledBy: f.filledBy, visibility: f.visibility,
      config: f.config, ratingScaleId: f.type === 'RATING' ? f.ratingScaleId : null, scored: f.scored,
      weightPercent: f.scored ? weight(f.weightPercent) : null, maxMarks: f.scored && marks ? orNull(f.maxMarks) : null,
    })),
  };
}

/** How a KPI is scored when first added: what suits its kind of measurement and the targets it has. */
export function kpiLineOf(kpi: Pick<KraKpi, 'kpiId' | 'kpiCode' | 'kpiName' | 'measurementType' | 'direction' | 'unitLabel' | 'defaultTarget' | 'minimumExpected' | 'stretchTarget' | 'defaultMaxMarks' | 'ratingScaleId'>, weight: string | null): KpiForm {
  const type = kpi.measurementType;
  const method: ScoringMethod = type === 'RATING' || type === 'QUALITATIVE' ? 'RATING_SCALE' : type === 'YES_NO' ? 'YES_NO' : type === 'MILESTONE' ? 'COMPLETION_PERCENT' : 'PERCENT_OF_TARGET';
  return {
    kpiId: kpi.kpiId, kpiCode: kpi.kpiCode, kpiName: kpi.kpiName, measurementType: type, direction: kpi.direction, unitLabel: kpi.unitLabel,
    weightPercent: weight ?? '', maxMarks: str(kpi.defaultMaxMarks), scoringMethod: method, scoringConfig: defaultConfig(method),
    // Without a library target, targets are usually personal: set when each appraisal is prepared.
    targetSource: kpi.defaultTarget ? 'TEMPLATE' : 'PER_EMPLOYEE',
    target: str(kpi.defaultTarget), threshold: str(kpi.minimumExpected), stretch: str(kpi.stretchTarget),
    ratingScaleId: kpi.ratingScaleId, allowsExemption: false,
  };
}

export function kpiLineFromKpi(kpi: Kpi): KpiForm {
  return kpiLineOf({ ...kpi, kpiId: kpi.id, ratingScaleId: kpi.ratingScale?.id ?? null }, null);
}

/** A library KRA as a new template line, with its suggested KPIs and weights. */
export function kraLineOf(kra: Kra): KraForm {
  const scaleId = kra.ratingScale?.id ?? null;
  return {
    kraId: kra.id, kraCode: kra.kraCode, kraName: kra.kraName, weightPercent: str(kra.defaultWeightPercent), maxMarks: str(kra.defaultMaxMarks), minMarks: str(kra.defaultMinMarks),
    scoringMethod: kra.kpis.length ? null : scaleId ? 'RATING_SCALE' : kra.defaultMaxMarks ? 'DIRECT_MARKS' : 'MANUAL',
    ratingScaleId: scaleId, allowsExemption: false,
    kpis: kra.kpis.filter((k) => k.status === 'ACTIVE').map((k) => kpiLineOf(k, k.defaultWeightPercent)),
  };
}

/** A question key from its label, such as “Key achievements” → key_achievements. */
export function keyFrom(label: string, taken: string[]) {
  const base = (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '') || 'question').slice(0, 36).padEnd(2, '_');
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}_${n}`;
  return key;
}
