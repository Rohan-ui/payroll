import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { isoDate } from '@/modules/payroll/payroll-lock';
import { MAX_FILE_BYTES, safeFilename, sniffFileKind } from '@/modules/onboarding/candidate-documents';
import { decimal, personName } from './performance-common';
import { TEMPLATE_VERSION, templateDefinition } from './templates.service';
import { scoreAppraisal } from './scoring/scoring-engine';
import { show } from './scoring/scoring-methods';
import { TemplateDef } from './scoring/template-definition';
import { validateFieldConfig, FieldType } from './scoring/form-fields';
import { combineReviewers, returnTarget } from './workflow/workflow-engine';
import { StageDef } from './workflow/workflow-definition';
import { AppraisalRuntimeService, LIVE, loadRun, Run, today } from './appraisal/appraisal-runtime.service';
import { FormLine, formLines, inputsOf, ItemRow, lineIdOf, linesFor, presentItem, Viewer, visibility } from './appraisal/appraisal-lines';
import { SaveReviewDto, ReviewItemDto } from './dto/performance-cycles.dto';

type Tx = Prisma.TransactionClient;
export interface UploadedFile { buffer: Buffer; originalname: string; size: number }
const MAX_FILES_PER_REVIEW = 20;

/**
 * Reviews: the review inbox, the form each reviewer (or the employee, for
 * their self-assessment) fills in, and its evidence. Only the assigned
 * reviewer may write it, only while its stage is open; a submitted review
 * never changes. What a viewer may see of other reviews follows the
 * workflow's visibility rules, applied here on the server.
 */
@Injectable()
export class PerformanceReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: PrivateStorageService,
    private readonly runtime: AppraisalRuntimeService,
  ) {}

  /** What a member has to review now, recently submitted, and nominations waiting for them. */
  async inbox(tenantId: string, actor: AuthenticatedTenantUser) {
    const [open, done] = await Promise.all([
      this.prisma.rndtechnosoft_performance_reviewer_assignments.findMany({
        where: {
          tenant_id: tenantId, reviewer_tenant_member_id: actor.tenantMemberId, assignment_status: 'ASSIGNED',
          rndtechnosoft_performance_appraisal_stages: { stage_status: { in: ['OPEN', 'NEEDS_REVIEWERS'] } },
          rndtechnosoft_performance_appraisals: { appraisal_status: 'IN_PROGRESS' },
        },
        orderBy: { rndtechnosoft_performance_appraisal_stages: { due_date: 'asc' } },
        take: 200,
        include: this.taskInclude(),
      }),
      this.prisma.rndtechnosoft_performance_reviewer_assignments.findMany({
        where: { tenant_id: tenantId, reviewer_tenant_member_id: actor.tenantMemberId, assignment_status: 'SUBMITTED' },
        orderBy: { submitted_at: 'desc' }, take: 30, include: this.taskInclude(),
      }),
    ]);
    const todayIso = isoDate(today());
    const task = (a: (typeof open)[number]) => {
      const appraisal = a.rndtechnosoft_performance_appraisals;
      const stage = appraisal.rndtechnosoft_performance_workflow_versions.rndtechnosoft_performance_workflow_stages.find((s) => s.stage_key === a.rndtechnosoft_performance_appraisal_stages.stage_key);
      const due = a.rndtechnosoft_performance_appraisal_stages.due_date;
      return {
        assignmentId: a.id,
        appraisalId: appraisal.id,
        employee: { name: personName(appraisal.rndtechnosoft_employees), code: appraisal.rndtechnosoft_employees.employee_code },
        cycle: appraisal.rndtechnosoft_performance_cycles.cycle_name,
        stage: stage?.stage_name ?? a.rndtechnosoft_performance_appraisal_stages.stage_key,
        action: stage?.stage_action ?? 'RATE',
        isSelf: stage?.reviewer_source === 'SELF',
        dueDate: due ? isoDate(due) : null,
        overdue: !!due && isoDate(due) < todayIso,
        draftSaved: a.rndtechnosoft_performance_reviews?.review_status === 'DRAFT',
        submittedAt: a.submitted_at,
        reason: a.status_reason,
      };
    };
    return { toDo: open.map(task), done: done.map(task) };
  }

  /** The review form for one assignment: what to answer, earlier stages as the viewer may see them, and their own draft. */
  async form(tenantId: string, assignmentId: string, actor: AuthenticatedTenantUser, viewAll: boolean) {
    const { assignment, run, stage, version, lines, myLines } = await this.context(this.prisma, tenantId, assignmentId);
    const isOwner = assignment.reviewer_tenant_member_id === actor.tenantMemberId;
    if (!isOwner && !viewAll) throw new NotFoundException('Review not found.');
    const employee = run.appraisal;
    const emp = await this.prisma.rndtechnosoft_employees.findFirstOrThrow({
      where: { tenant_id: tenantId, id: employee.employee_id },
      select: { first_name: true, last_name: true, preferred_name: true, employee_code: true, user_id: true },
    });
    const viewer: Viewer = { memberId: actor.tenantMemberId, isEmployee: emp.user_id === actor.userId, viewAll };
    const review = await this.prisma.rndtechnosoft_performance_reviews.findFirst({
      where: { tenant_id: tenantId, assignment_id: assignmentId },
      include: { rndtechnosoft_performance_review_items: true, rndtechnosoft_performance_review_files: { orderBy: { created_at: 'asc' } } },
    });
    const items = review?.rndtechnosoft_performance_review_items ?? [];
    const def = templateDefinition(version);
    // The reviewer's own lines scored on their own, before combining with anyone else's.
    const preview = myLines.length ? scoreAppraisal({ ...def, policy: { ...def.policy, missingRule: 'EXCLUDE' } }, inputsOf(items, lines)) : null;
    const row = run.stages.get(stage.key);
    const cycle = await this.prisma.rndtechnosoft_performance_cycles.findFirstOrThrow({ where: { tenant_id: tenantId, id: employee.cycle_id }, select: { cycle_name: true, period_start: true, period_end: true } });
    const department = employee.department_id ? await this.prisma.rndtechnosoft_departments.findFirst({ where: { tenant_id: tenantId, id: employee.department_id }, select: { department_name: true } }) : null;
    const designation = employee.designation_id ? await this.prisma.rndtechnosoft_designations.findFirst({ where: { tenant_id: tenantId, id: employee.designation_id }, select: { designation_name: true } }) : null;

    return {
      assignmentId,
      appraisalId: employee.id,
      employee: { name: personName(emp), code: emp.employee_code, department: department?.department_name ?? null, designation: designation?.designation_name ?? null },
      cycle: { name: cycle.cycle_name, periodStart: isoDate(cycle.period_start), periodEnd: isoDate(cycle.period_end) },
      stage: {
        key: stage.key, name: stage.name, action: stage.action, isSelf: stage.source === 'SELF', status: row?.stage_status ?? 'WAITING',
        dueDate: row?.due_date ? isoDate(row.due_date) : null, allowsDecline: stage.allowsDecline,
        returnTo: run.def.stages.filter((s) => s.step < stage.step && !('problem' in returnTarget(run.def, stage.key, s.key))).map((s) => ({ key: s.key, name: s.name })),
      },
      assignment: { status: assignment.assignment_status, reason: assignment.status_reason },
      canEdit: isOwner && this.editable(run, assignment),
      lines: myLines,
      // Every line of the form, to read earlier reviews against.
      allLines: lines,
      review: {
        status: review?.review_status ?? 'DRAFT',
        overallComment: review?.overall_comment ?? null,
        submittedAt: review?.submitted_at ?? null,
        items: items.map(presentItem),
        files: (review?.rndtechnosoft_performance_review_files ?? []).map((f) => ({ id: f.id, lineId: f.template_kra_id ?? f.template_kpi_id ?? f.template_field_id, name: f.original_filename, size: f.file_size_bytes })),
      },
      preview: preview && {
        scorePercent: preview.status === 'COMPLETE' ? preview.scorePercent : null,
        lines: [...preview.kras.flatMap((k) => (k.kpis.length ? k.kpis : [k])), ...preview.fields].filter((l) => myLines.some((m) => m.id === l.key))
          .map((l) => ({ lineId: l.key, status: l.status, scorePercent: l.scorePercent, steps: l.steps, problem: l.problem })),
      },
      earlier: await this.earlier(tenantId, run, viewer, def, lines, stage),
    };
  }

  /** Saves answers as a draft; only the lines this stage answers. */
  async save(tenantId: string, assignmentId: string, input: SaveReviewDto, actor: AuthenticatedTenantUser) {
    await this.prisma.$transaction(async (tx) => {
      const { assignment, run, myLines } = await this.writable(tx, tenantId, assignmentId, actor);
      const allowed = new Map(myLines.map((l) => [l.id, l]));
      for (const item of input.items) {
        const line = allowed.get(item.lineId);
        if (!line || line.kind !== item.kind) throw new BadRequestException('An answer is for a line this stage doesn’t answer.');
      }
      const reviewId = await this.reviewOf(tx, tenantId, assignment.id);
      await tx.rndtechnosoft_performance_reviews.update({ where: { tenant_id_id: { tenant_id: tenantId, id: reviewId } }, data: { overall_comment: input.overallComment?.trim() || null, updated_at: new Date() } });
      await tx.rndtechnosoft_performance_review_items.deleteMany({ where: { tenant_id: tenantId, review_id: reviewId } });
      if (input.items.length) {
        await tx.rndtechnosoft_performance_review_items.createMany({ data: input.items.map((i) => ({ id: randomUUID(), tenant_id: tenantId, review_id: reviewId, ...this.columns(i) })) });
      }
      void run;
    });
    return this.form(tenantId, assignmentId, actor, false);
  }

  /**
   * Submits the review once everything it must answer is answered and
   * scorable, and any required evidence is attached. A review or approval
   * stage submits its approval. The appraisal then moves on if it can.
   */
  async submit(tenantId: string, assignmentId: string, actor: AuthenticatedTenantUser) {
    const appraisalId = await this.prisma.$transaction(async (tx) => {
      const { assignment, run, stage, version, lines, myLines } = await this.writable(tx, tenantId, assignmentId, actor);
      const reviewId = await this.reviewOf(tx, tenantId, assignment.id);
      const review = await tx.rndtechnosoft_performance_reviews.findFirstOrThrow({
        where: { tenant_id: tenantId, id: reviewId },
        include: { rndtechnosoft_performance_review_items: true, rndtechnosoft_performance_review_files: true },
      });
      const problems = this.problems(stage, templateDefinition(version), myLines, lines, review.rndtechnosoft_performance_review_items, review.rndtechnosoft_performance_review_files);
      if (problems.length) throw new BadRequestException({ message: 'Some answers are needed before submitting.', errors: problems.map((message) => ({ message })) });
      const now = new Date();
      await tx.rndtechnosoft_performance_reviews.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: reviewId } },
        data: { review_status: 'SUBMITTED', submitted_at: now, decision: stage.action === 'RATE' ? null : 'APPROVE', updated_at: now },
      });
      // Only an assignment still open can be submitted, so a double submit counts once.
      const { count } = await tx.rndtechnosoft_performance_reviewer_assignments.updateMany({
        where: { tenant_id: tenantId, id: assignment.id, assignment_status: 'ASSIGNED' },
        data: { assignment_status: 'SUBMITTED', submitted_at: now, updated_at: now },
      });
      if (!count) throw new ConflictException('This review was already submitted.');
      await this.runtime.refresh(tx, tenantId, run.appraisal.id);
      return run.appraisal.id;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_REVIEW_SUBMITTED', appraisalId, { assignment_id: assignmentId });
    return this.form(tenantId, assignmentId, actor, false);
  }

  /** Declines a review the stage lets reviewers decline; the stage then needs someone else if it is short. */
  async decline(tenantId: string, assignmentId: string, reason: string, actor: AuthenticatedTenantUser) {
    const appraisalId = await this.prisma.$transaction(async (tx) => {
      const { assignment, run, stage } = await this.writable(tx, tenantId, assignmentId, actor);
      if (!stage.allowsDecline) throw new BadRequestException(`${stage.name} can’t be declined.`);
      await tx.rndtechnosoft_performance_reviewer_assignments.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: assignment.id } },
        data: { assignment_status: 'DECLINED', status_reason: reason.trim(), closed_at: new Date(), updated_at: new Date() },
      });
      await this.runtime.refresh(tx, tenantId, run.appraisal.id);
      return run.appraisal.id;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_REVIEW_DECLINED', appraisalId, { assignment_id: assignmentId, reason: reason.trim() });
    return { declined: true };
  }

  /** Sends the appraisal back to an earlier stage for correction, as this stage allows; the reviewer's own draft is kept. */
  async sendBack(tenantId: string, assignmentId: string, toStageKey: string, reason: string, actor: AuthenticatedTenantUser) {
    const appraisalId = await this.prisma.$transaction(async (tx) => {
      const { run, stage } = await this.writable(tx, tenantId, assignmentId, actor);
      await this.runtime.sendBack(tx, tenantId, run, stage.key, toStageKey, reason.trim());
      await this.runtime.refresh(tx, tenantId, run.appraisal.id);
      return run.appraisal.id;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_APPRAISAL_SENT_BACK', appraisalId, { assignment_id: assignmentId, to_stage: toStageKey, reason: reason.trim() });
    return this.form(tenantId, assignmentId, actor, false);
  }

  /** Attaches evidence to a draft: a PDF, JPG or PNG checked by its content, for a line or the whole review. */
  async upload(tenantId: string, assignmentId: string, line: { lineId?: string; kind?: 'KRA' | 'KPI' | 'FIELD' }, file: UploadedFile | undefined, actor: AuthenticatedTenantUser) {
    if (!file || !file.buffer || file.size === 0) throw new BadRequestException('Choose a file to upload.');
    if (file.size > MAX_FILE_BYTES) throw new BadRequestException('The file is larger than 10 MB. Upload a smaller copy.');
    const kind = sniffFileKind(file.buffer);
    if (!kind) throw new BadRequestException('Upload a PDF, JPG or PNG file.');
    await this.prisma.$transaction(async (tx) => {
      const { assignment, myLines } = await this.writable(tx, tenantId, assignmentId, actor);
      const target = line.lineId ? myLines.find((l) => l.id === line.lineId && l.kind === line.kind) : null;
      if (line.lineId && !target) throw new BadRequestException('Evidence can only be attached to a line this stage answers.');
      const reviewId = await this.reviewOf(tx, tenantId, assignment.id);
      const count = await tx.rndtechnosoft_performance_review_files.count({ where: { tenant_id: tenantId, review_id: reviewId } });
      if (count >= MAX_FILES_PER_REVIEW) throw new ConflictException(`A review can have at most ${MAX_FILES_PER_REVIEW} files.`);
      const stored = await this.storage.save(tenantId, 'performance-evidence', file.buffer, kind.extension);
      await tx.rndtechnosoft_performance_review_files.create({
        data: {
          id: randomUUID(), tenant_id: tenantId, review_id: reviewId, original_filename: safeFilename(file.originalname, kind.extension, 'evidence'),
          content_type: kind.contentType, file_size_bytes: stored.size, storage_key: stored.key, file_sha256: stored.sha256, uploaded_by_tenant_member_id: actor.tenantMemberId,
          ...(target ? { [target.kind === 'KRA' ? 'template_kra_id' : target.kind === 'KPI' ? 'template_kpi_id' : 'template_field_id']: target.id } : {}),
        },
      });
    });
    return this.form(tenantId, assignmentId, actor, false);
  }

  async removeFile(tenantId: string, assignmentId: string, fileId: string, actor: AuthenticatedTenantUser) {
    await this.prisma.$transaction(async (tx) => {
      const { assignment } = await this.writable(tx, tenantId, assignmentId, actor);
      const reviewId = await this.reviewOf(tx, tenantId, assignment.id);
      const { count } = await tx.rndtechnosoft_performance_review_files.deleteMany({ where: { tenant_id: tenantId, review_id: reviewId, id: fileId } });
      if (!count) throw new NotFoundException('File not found.');
    });
    return this.form(tenantId, assignmentId, actor, false);
  }

  /** An evidence file, to whoever may see the review it belongs to (named or not). */
  async file(tenantId: string, fileId: string, actor: AuthenticatedTenantUser, viewAll: boolean) {
    const file = await this.prisma.rndtechnosoft_performance_review_files.findFirst({
      where: { tenant_id: tenantId, id: fileId },
      include: { rndtechnosoft_performance_reviews: { select: { review_status: true, rndtechnosoft_performance_reviewer_assignments: true } } },
    });
    if (!file) throw new NotFoundException('File not found.');
    const assignment = file.rndtechnosoft_performance_reviews.rndtechnosoft_performance_reviewer_assignments;
    const run = await loadRun(this.prisma as unknown as Tx, tenantId, assignment.appraisal_id);
    const emp = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: run.appraisal.employee_id }, select: { user_id: true } });
    const seen = visibility({ memberId: actor.tenantMemberId, isEmployee: emp?.user_id === actor.userId, viewAll }, run, assignment);
    const own = assignment.reviewer_tenant_member_id === actor.tenantMemberId;
    // Files of others' reviews only once submitted, and never just combined (a file can't be averaged).
    if (!own && (seen === 'NONE' || seen === 'AGGREGATE' || file.rndtechnosoft_performance_reviews.review_status !== 'SUBMITTED')) throw new NotFoundException('File not found.');
    return { bytes: await this.storage.read(tenantId, file.storage_key), contentType: file.content_type, name: file.original_filename };
  }

  /**
   * One submitted review, read-only, to someone the visibility rules let see
   * it on its own (the employee, or a later reviewer): with its author's name
   * only when the stage shows names. Anything else is reported as not found.
   */
  async read(tenantId: string, assignmentId: string, actor: AuthenticatedTenantUser, viewAll: boolean) {
    const { assignment, run, stage, lines } = await this.context(this.prisma, tenantId, assignmentId);
    const emp = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: run.appraisal.employee_id }, select: { user_id: true } });
    const seen = visibility({ memberId: actor.tenantMemberId, isEmployee: emp?.user_id === actor.userId, viewAll }, run, assignment);
    if (assignment.assignment_status !== 'SUBMITTED' || seen === 'NONE' || seen === 'AGGREGATE') throw new NotFoundException('Review not found.');
    const review = await this.prisma.rndtechnosoft_performance_reviews.findFirstOrThrow({
      where: { tenant_id: tenantId, assignment_id: assignmentId },
      include: { rndtechnosoft_performance_review_items: true, rndtechnosoft_performance_review_files: true, rndtechnosoft_performance_reviewer_assignments: { select: { reviewer: { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } } } },
    });
    const author = review.rndtechnosoft_performance_reviewer_assignments.reviewer.rndtechnosoft_users;
    return {
      stage: stage.name,
      reviewer: seen === 'FULL' ? author.display_name ?? author.email : null,
      submittedAt: review.submitted_at,
      overallComment: review.overall_comment,
      lines: linesFor(stage, lines),
      items: review.rndtechnosoft_performance_review_items.map(presentItem),
      files: review.rndtechnosoft_performance_review_files.map((f) => ({ id: f.id, lineId: f.template_kra_id ?? f.template_kpi_id ?? f.template_field_id, name: f.original_filename })),
    };
  }

  /** Earlier stages' submitted reviews, as much of each as the viewer may see. */
  private async earlier(tenantId: string, run: Run, viewer: Viewer, def: TemplateDef, lines: FormLine[], current: StageDef) {
    const submitted = run.assignments.filter((a) => a.assignment_status === 'SUBMITTED');
    if (!submitted.length) return [];
    const reviews = await this.prisma.rndtechnosoft_performance_reviews.findMany({
      where: { tenant_id: tenantId, assignment_id: { in: submitted.map((a) => a.id) } },
      include: { rndtechnosoft_performance_review_items: true, rndtechnosoft_performance_review_files: true },
    });
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: { tenant_id: tenantId, id: { in: submitted.map((a) => a.reviewer_tenant_member_id) } },
      select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    const name = (id: string) => { const m = members.find((x) => x.id === id); return m ? m.rndtechnosoft_users.display_name ?? m.rndtechnosoft_users.email : null; };
    const out = [];
    for (const stage of run.def.stages) {
      if (stage.key === current.key) continue;
      const row = run.stages.get(stage.key);
      const here = submitted.filter((a) => a.appraisal_stage_id === row?.id);
      const shown = here.map((a) => ({ a, seen: visibility(viewer, run, a), review: reviews.find((r) => r.assignment_id === a.id) })).filter((x) => x.seen !== 'NONE' && x.review);
      if (!shown.length) continue;
      if (shown.every((x) => x.seen === 'AGGREGATE')) {
        // Only each line's combined score: no comments, no names, no evidence.
        const each = shown.map((x) => ({ reviewerId: x.a.reviewer_tenant_member_id, scores: lineScores(def, x.review?.rndtechnosoft_performance_review_items as ItemRow[], lines) }));
        const perLine = lines.map((line) => {
          const scores = each.flatMap((e) => {
            const s = e.scores.get(line.id);
            return s?.status === 'SCORED' && s.percent !== null ? [{ reviewerId: e.reviewerId, percent: new Prisma.Decimal(s.percent) }] : [];
          });
          const combined = combineReviewers({ name: stage.name, aggregation: 'AVERAGE' }, scores);
          return combined ? { lineId: line.id, name: line.name, scorePercent: show(combined.percent), reviews: scores.length } : null;
        }).filter(Boolean);
        out.push({ stage: stage.name, mode: 'AGGREGATE' as const, reviews: [], combined: perLine });
        continue;
      }
      out.push({
        stage: stage.name, mode: 'INDIVIDUAL' as const, combined: [],
        reviews: shown.filter((x) => x.seen !== 'AGGREGATE').map((x) => ({
          reviewer: x.seen === 'FULL' ? name(x.a.reviewer_tenant_member_id) : null,
          submittedAt: x.review?.submitted_at,
          overallComment: x.review?.overall_comment ?? null,
          items: (x.review?.rndtechnosoft_performance_review_items ?? []).map(presentItem),
          files: (x.review?.rndtechnosoft_performance_review_files ?? []).map((f) => ({ id: f.id, lineId: f.template_kra_id ?? f.template_kpi_id ?? f.template_field_id, name: f.original_filename })),
        })),
      });
    }
    return out;
  }

  /** What still stops a review being submitted. */
  private problems(stage: StageDef, def: TemplateDef, myLines: FormLine[], lines: FormLine[], items: ItemRow[], files: { template_kra_id: string | null; template_kpi_id: string | null; template_field_id: string | null }[]): string[] {
    const problems: string[] = [];
    const byLine = new Map(items.map((i) => [lineIdOf(i), i]));
    const scores = lineScores(def, items, lines);
    for (const line of myLines) {
      const item = byLine.get(line.id);
      const label = line.kraName && line.kind === 'KPI' ? `${line.kraName} → ${line.name}` : line.name;
      if (line.kind === 'FIELD') {
        const answered = item && (item.text_value?.trim() || item.number_value !== null || item.rating_value !== null || item.yes_no !== null || item.date_value || item.option_values.length);
        if (!answered) { if (line.field?.required) problems.push(`${label}: an answer is needed.`); continue; }
        const problem = fieldAnswerProblem(line, item as ItemRow);
        if (problem) problems.push(`${label}: ${problem}`);
        continue;
      }
      if (item?.is_exempt) { if (!line.allowsExemption) problems.push(`${label} can’t be marked exempt.`); continue; }
      const score = scores.get(line.id);
      if (!score || score.status === 'MISSING') problems.push(`${label}: a rating is needed.`);
      else if (score.status === 'INVALID') problems.push(`${label}: ${score.problem}`);
      // The employee supports their own results with evidence where the template asks for it.
      if (stage.source === 'SELF' && line.evidence === 'REQUIRED' && !files.some((f) => (f.template_kra_id ?? f.template_kpi_id) === line.id)) {
        problems.push(`${label}: attach the evidence it asks for.`);
      }
    }
    return problems;
  }

  /** The assignment, its appraisal's run, its stage, the template version and the lines. */
  private async context(db: Tx | PrismaService, tenantId: string, assignmentId: string) {
    const assignment = await db.rndtechnosoft_performance_reviewer_assignments.findFirst({ where: { tenant_id: tenantId, id: assignmentId } });
    if (!assignment) throw new NotFoundException('Review not found.');
    const run = await loadRun(db as Tx, tenantId, assignment.appraisal_id);
    const row = [...run.stages.values()].find((s) => s.id === assignment.appraisal_stage_id);
    const stage = run.def.stages.find((s) => s.key === row?.stage_key);
    if (!stage) throw new NotFoundException('Review not found.');
    const version = await db.rndtechnosoft_performance_template_versions.findFirstOrThrow({ where: { tenant_id: tenantId, id: run.appraisal.template_version_id }, include: TEMPLATE_VERSION });
    const targets = await db.rndtechnosoft_performance_appraisal_targets.findMany({ where: { tenant_id: tenantId, appraisal_id: run.appraisal.id } });
    const lines = formLines(version, new Map(targets.map((t) => [t.template_kpi_id, { target: t.target_value, threshold: t.threshold_value, stretch: t.stretch_value }])));
    return { assignment, run, stage, version, lines, myLines: linesFor(stage, lines) };
  }

  /** The context for writing: only the assigned reviewer, with the appraisal locked and the stage open. */
  private async writable(tx: Tx, tenantId: string, assignmentId: string, actor: AuthenticatedTenantUser) {
    const first = await tx.rndtechnosoft_performance_reviewer_assignments.findFirst({ where: { tenant_id: tenantId, id: assignmentId }, select: { appraisal_id: true, reviewer_tenant_member_id: true } });
    if (!first || first.reviewer_tenant_member_id !== actor.tenantMemberId) throw new NotFoundException('Review not found.');
    await this.runtime.lock(tx, tenantId, first.appraisal_id);
    const context = await this.context(tx, tenantId, assignmentId);
    if (!this.editable(context.run, context.assignment)) {
      throw new ForbiddenException(context.assignment.assignment_status === 'SUBMITTED' ? 'This review is submitted and can no longer change.' : 'This review isn’t open for you now.');
    }
    return context;
  }

  private editable(run: Run, assignment: { assignment_status: string; appraisal_stage_id: string }) {
    const row = [...run.stages.values()].find((s) => s.id === assignment.appraisal_stage_id);
    return run.appraisal.appraisal_status === 'IN_PROGRESS' && assignment.assignment_status === 'ASSIGNED' && !!row && ['OPEN', 'NEEDS_REVIEWERS'].includes(row.stage_status);
  }

  private async reviewOf(tx: Tx, tenantId: string, assignmentId: string) {
    const existing = await tx.rndtechnosoft_performance_reviews.findFirst({ where: { tenant_id: tenantId, assignment_id: assignmentId }, select: { id: true } });
    if (existing) return existing.id;
    const id = randomUUID();
    await tx.rndtechnosoft_performance_reviews.create({ data: { id, tenant_id: tenantId, assignment_id: assignmentId } });
    return id;
  }

  private columns(i: ReviewItemDto) {
    return {
      template_kra_id: i.kind === 'KRA' ? i.lineId : null,
      template_kpi_id: i.kind === 'KPI' ? i.lineId : null,
      template_field_id: i.kind === 'FIELD' ? i.lineId : null,
      actual_value: decimal(i.actual), rating_value: decimal(i.rating), marks_value: decimal(i.marks), score_percent: decimal(i.scorePercent),
      yes_no: i.yesNo ?? null, number_value: decimal(i.number), text_value: i.text?.trim() || null, option_values: i.options ?? [],
      date_value: i.date ? new Date(`${i.date}T00:00:00.000Z`) : null, is_exempt: i.exempt ?? false,
      justification: i.justification?.trim() || null, item_comment: i.comment?.trim() || null,
    };
  }

  private taskInclude() {
    return {
      rndtechnosoft_performance_reviews: { select: { review_status: true } },
      rndtechnosoft_performance_appraisal_stages: { select: { stage_key: true, due_date: true } },
      rndtechnosoft_performance_appraisals: {
        select: {
          id: true,
          rndtechnosoft_employees: { select: { first_name: true, last_name: true, preferred_name: true, employee_code: true } },
          rndtechnosoft_performance_cycles: { select: { cycle_name: true } },
          rndtechnosoft_performance_workflow_versions: { select: { rndtechnosoft_performance_workflow_stages: { select: { stage_key: true, stage_name: true, stage_action: true, reviewer_source: true } } } },
        },
      },
    } satisfies Prisma.rndtechnosoft_performance_reviewer_assignmentsInclude;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, appraisalId: string, metadata: Record<string, unknown>) {
    // Answers and comments stay out of the audit trail; it records what happened, not what was written.
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PERFORMANCE_APPRAISAL', entityId: appraisalId, metadata });
  }
}

/**
 * Each line's score from one review's answers, by the template's own rules
 * (lines left unanswered are simply not scored here).
 */
function lineScores(def: TemplateDef, items: ItemRow[], lines: FormLine[]) {
  const result = scoreAppraisal({ ...def, policy: { ...def.policy, missingRule: 'EXCLUDE' } }, inputsOf(items, lines));
  const all = [...result.kras.flatMap((k) => (k.kpis.length ? k.kpis : [k])), ...result.fields];
  return new Map(all.map((l) => [l.key, { status: l.status, percent: l.scorePercent, problem: l.problem, steps: l.steps }]));
}

/** Whether an answer to a question fits its kind and settings. */
function fieldAnswerProblem(line: FormLine, item: ItemRow): string | null {
  const type = line.field?.type as FieldType;
  const config = validateFieldConfig(type, line.field?.config, false, line.name);
  if ('problems' in config) return null;
  const c = config.config as { maxLength?: number; options?: string[]; min?: string | null; max?: string | null; decimals?: number };
  if (c.maxLength && (item.text_value?.length ?? 0) > c.maxLength) return `at most ${c.maxLength} characters.`;
  if (type === 'DROPDOWN' && (item.option_values.length > 1 || (item.text_value && !c.options?.includes(item.text_value)))) return 'choose one of its choices.';
  if (type === 'DROPDOWN' && item.option_values.length === 1 && !c.options?.includes(item.option_values[0])) return 'choose one of its choices.';
  if (type === 'MULTI_SELECT' && item.option_values.some((o) => !c.options?.includes(o))) return 'choose from its choices.';
  if (type === 'NUMBER' && item.number_value !== null) {
    if (c.min && item.number_value.lt(c.min)) return `at least ${c.min}.`;
    if (c.max && item.number_value.gt(c.max)) return `at most ${c.max}.`;
    if (c.decimals !== undefined && item.number_value.decimalPlaces() > c.decimals) return `at most ${c.decimals} decimal places.`;
  }
  if (type === 'RATING' && item.rating_value !== null && line.scale?.kind === 'LEVELS' && !line.scale.levels.some((l) => new Prisma.Decimal(l.value).eq(item.rating_value as Prisma.Decimal))) return 'choose one of the scale’s ratings.';
  return null;
}
