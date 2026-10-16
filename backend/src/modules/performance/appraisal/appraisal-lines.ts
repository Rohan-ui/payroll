import { Prisma } from '@prisma/client';
import { text } from '../performance-common';
import { TemplateVersionRow } from '../templates.service';
import { ItemInput } from '../scoring/scoring-methods';
import { StageDef } from '../workflow/workflow-definition';
import { stageRates } from '../workflow/workflow-engine';
import { Run } from './appraisal-runtime.service';

/**
 * The lines of an appraisal's form, as its template version defines them,
 * with each employee's own targets where the template leaves them open; who
 * answers which line at each stage; and what may be seen of others' reviews.
 */

type Decimal = Prisma.Decimal;

export type LineKind = 'KRA' | 'KPI' | 'FIELD';

export interface FormLine {
  id: string;
  kind: LineKind;
  /** The library KRA it belongs to, which decides which stages rate it. */
  kraLibraryId: string | null;
  kraName: string | null;
  code: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  evidence: 'NONE' | 'OPTIONAL' | 'REQUIRED';
  method: string | null;
  measurementType: string | null;
  unitLabel: string | null;
  currencyCode: string | null;
  direction: string | null;
  maxMarks: string | null;
  minMarks: string | null;
  allowsExemption: boolean;
  targetSource: 'TEMPLATE' | 'PER_EMPLOYEE' | null;
  target: string | null;
  threshold: string | null;
  stretch: string | null;
  scale: { kind: string; min: string | null; max: string | null; step: string | null; levels: { value: string; label: string }[] } | null;
  field: { type: string; required: boolean; filledBy: string; config: unknown } | null;
}

type Targets = Map<string, { target: Decimal | null; threshold: Decimal | null; stretch: Decimal | null }>;

const scaleOf = (v: { input_kind: string; min_value: Decimal | null; max_value: Decimal | null; step_value: Decimal | null; rndtechnosoft_performance_rating_scale_levels: { level_value: Decimal; level_label: string }[] } | null) =>
  v && {
    kind: v.input_kind, min: text(v.min_value), max: text(v.max_value), step: text(v.step_value),
    levels: [...v.rndtechnosoft_performance_rating_scale_levels].sort((a, b) => a.level_value.comparedTo(b.level_value)).map((l) => ({ value: l.level_value.toString(), label: l.level_label })),
  };

/** Every line of the form, in order: KRAs (with their KPIs), then questions. */
export function formLines(version: TemplateVersionRow, targets: Targets): FormLine[] {
  const lines: FormLine[] = [];
  for (const kra of version.rndtechnosoft_performance_template_kras) {
    if (!kra.rndtechnosoft_performance_template_kpis.length) {
      lines.push({
        id: kra.id, kind: 'KRA', kraLibraryId: kra.kra_id, kraName: kra.kra_name, code: kra.kra_code, name: kra.kra_name, description: kra.kra_description,
        instructions: kra.evaluation_instructions, evidence: kra.evidence_requirement as FormLine['evidence'], method: kra.scoring_method, measurementType: null,
        unitLabel: null, currencyCode: null, direction: null, maxMarks: text(kra.max_marks), minMarks: text(kra.min_marks), allowsExemption: kra.allows_exemption,
        targetSource: null, target: null, threshold: null, stretch: null, scale: scaleOf(kra.rndtechnosoft_performance_rating_scale_versions), field: null,
      });
    }
    for (const kpi of kra.rndtechnosoft_performance_template_kpis) {
      const own = targets.get(kpi.id);
      const personal = kpi.target_source === 'PER_EMPLOYEE';
      lines.push({
        id: kpi.id, kind: 'KPI', kraLibraryId: kra.kra_id, kraName: kra.kra_name, code: kpi.kpi_code, name: kpi.kpi_name, description: kpi.kpi_description,
        instructions: kpi.evaluation_instructions, evidence: kpi.evidence_requirement as FormLine['evidence'], method: kpi.scoring_method, measurementType: kpi.measurement_type,
        unitLabel: kpi.unit_label, currencyCode: kpi.currency_code, direction: kpi.direction, maxMarks: text(kpi.max_marks), minMarks: null, allowsExemption: kpi.allows_exemption,
        targetSource: kpi.target_source as FormLine['targetSource'],
        target: text(personal ? own?.target ?? kpi.target_value : kpi.target_value),
        threshold: text(personal ? own?.threshold ?? kpi.threshold_value : kpi.threshold_value),
        stretch: text(personal ? own?.stretch ?? kpi.stretch_value : kpi.stretch_value),
        scale: scaleOf(kpi.rndtechnosoft_performance_rating_scale_versions), field: null,
      });
    }
  }
  for (const f of version.rndtechnosoft_performance_template_fields) {
    lines.push({
      id: f.id, kind: 'FIELD', kraLibraryId: null, kraName: null, code: f.field_key, name: f.field_label, description: f.field_description, instructions: null,
      evidence: 'NONE', method: null, measurementType: null, unitLabel: null, currencyCode: null, direction: null, maxMarks: null, minMarks: null, allowsExemption: false,
      targetSource: null, target: null, threshold: null, stretch: null, scale: scaleOf(f.rndtechnosoft_performance_rating_scale_versions),
      field: { type: f.field_type, required: f.is_required, filledBy: f.filled_by, config: f.field_config },
    });
  }
  return lines;
}

/** The lines a stage's reviewers answer: what it rates, and the questions meant for them. */
export function linesFor(stage: StageDef, lines: FormLine[]): FormLine[] {
  if (stage.action !== 'RATE') return [];
  return lines.filter((line) => {
    if (line.kind !== 'FIELD') return stageRates(stage, { kind: 'KRA_ITEM', kraId: line.kraLibraryId as string });
    const forThem = stage.source === 'SELF' ? line.field?.filledBy !== 'REVIEWERS' : line.field?.filledBy !== 'SELF';
    return forThem && stageRates(stage, { kind: 'QUESTION' });
  });
}

export type ItemRow = Prisma.rndtechnosoft_performance_review_itemsGetPayload<Record<string, never>>;

export const lineIdOf = (item: { template_kra_id: string | null; template_kpi_id: string | null; template_field_id: string | null }) =>
  (item.template_kra_id ?? item.template_kpi_id ?? item.template_field_id) as string;

/** A review's answers as the scoring rules read them, with the employee's own targets. */
export function inputsOf(items: ItemRow[], lines: FormLine[]): Record<string, ItemInput> {
  const inputs: Record<string, ItemInput> = {};
  for (const item of items) {
    const id = lineIdOf(item);
    const line = lines.find((l) => l.id === id);
    if (!line) continue;
    inputs[id] = {
      actual: text(item.actual_value), rating: text(item.rating_value), marks: text(item.marks_value), scorePercent: text(item.score_percent),
      value: text(item.number_value), answer: item.yes_no === null ? null : item.yes_no ? 'YES' : 'NO', justification: item.justification, exempt: item.is_exempt,
      ...(line.targetSource === 'PER_EMPLOYEE' ? { target: line.target, threshold: line.threshold, stretch: line.stretch } : {}),
    };
    // A rating question answers with its rating; a number question with its number.
    if (line.kind === 'FIELD' && line.field?.type === 'RATING') inputs[id].rating = text(item.rating_value);
  }
  return inputs;
}

/** An answer as the API shows it. */
export function presentItem(item: ItemRow) {
  return {
    lineId: lineIdOf(item), actual: text(item.actual_value), rating: text(item.rating_value), marks: text(item.marks_value), scorePercent: text(item.score_percent),
    yesNo: item.yes_no, number: text(item.number_value), text: item.text_value, options: item.option_values, date: item.date_value ? item.date_value.toISOString().slice(0, 10) : null,
    exempt: item.is_exempt, justification: item.justification, comment: item.item_comment,
  };
}

/** Who is looking at an appraisal, as the visibility rules need it. */
export interface Viewer { memberId: string; isEmployee: boolean; viewAll: boolean }

/**
 * What a viewer may see of one assignment's submitted review:
 *   FULL       the review and who wrote it;
 *   ANONYMOUS  the review without who wrote it;
 *   AGGREGATE  only combined with the stage's other reviews;
 *   NONE       nothing.
 * Reviewers see their own work; the employee sees other stages only as each
 * stage allows (shown after finalization from phase 5 on); reviewers see
 * earlier steps as those stages allow, never the stages running beside them.
 * People who may read every review see it all, names included.
 */
export function visibility(viewer: Viewer, run: Run, assignment: { reviewer_tenant_member_id: string; appraisal_stage_id: string }): 'FULL' | 'ANONYMOUS' | 'AGGREGATE' | 'NONE' {
  if (viewer.viewAll || assignment.reviewer_tenant_member_id === viewer.memberId) return 'FULL';
  const row = [...run.stages.values()].find((s) => s.id === assignment.appraisal_stage_id);
  const stage = row && run.def.stages.find((s) => s.key === row.stage_key);
  if (!row || !stage) return 'NONE';
  if (viewer.isEmployee) {
    if (stage.source === 'SELF') return 'FULL';
    if (stage.employeeSees === 'INDIVIDUAL_AFTER_STAGE' && row.stage_status === 'COMPLETE') return stage.identity === 'HIDDEN_FROM_EMPLOYEE' ? 'ANONYMOUS' : 'FULL';
    return 'NONE';
  }
  const mine = run.assignments.filter((a) => a.reviewer_tenant_member_id === viewer.memberId && ['ASSIGNED', 'SUBMITTED'].includes(a.assignment_status));
  const mySteps = mine.map((a) => [...run.stages.values()].find((s) => s.id === a.appraisal_stage_id)?.step_number ?? 0);
  if (!mySteps.some((step) => step > stage.step)) return 'NONE';
  if (stage.laterStagesSee === 'NOTHING') return 'NONE';
  if (stage.laterStagesSee === 'AGGREGATE') return 'AGGREGATE';
  return stage.identity === 'HIDDEN_FROM_EMPLOYEE' ? 'ANONYMOUS' : 'FULL';
}
