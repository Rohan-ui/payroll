import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import {
  CreateWorkflowDto,
  PublishWorkflowDto,
  SaveWorkflowDraftDto,
  UpdateWorkflowDto,
  WorkflowStageType,
} from './dto/workflow-builder.dto';

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    stageCount: number;
    transitionCount: number;
    initialStages: string[];
    terminalStages: string[];
    unreachableStages: string[];
  };
}

export const DEFAULT_WORKFLOW_CODE = 'standard-onboarding';
export const DEFAULT_WORKFLOW_NAME = 'Standard Onboarding Workflow';

interface DefaultStageSpec {
  key: string;
  name: string;
  description: string;
  type: WorkflowStageType;
  isInitial: boolean;
  isTerminal: boolean;
  color: string;
  icon: string;
  x: number;
  y: number;
  order: number;
  config?: Record<string, any>;
}

const DEFAULT_STAGES: DefaultStageSpec[] = [
  {
    key: 'APPLICATION_RECEIVED',
    name: 'Application Received',
    description: 'Candidate profile or application added to the hiring pipeline.',
    type: 'START',
    isInitial: true,
    isTerminal: false,
    color: '#0ea5e9',
    icon: 'Inbox',
    x: 80,
    y: 180,
    order: 1,
  },
  {
    key: 'SCREENING',
    name: 'Screening',
    description: 'Initial resume screening and recruiter qualification call.',
    type: 'STANDARD',
    isInitial: false,
    isTerminal: false,
    color: '#6366f1',
    icon: 'Search',
    x: 360,
    y: 180,
    order: 2,
    config: { requiredAction: 'RECRUITER_REVIEW' },
  },
  {
    key: 'INTERVIEW',
    name: 'Interview',
    description: 'Technical and cultural assessment interview rounds.',
    type: 'STANDARD',
    isInitial: false,
    isTerminal: false,
    color: '#8b5cf6',
    icon: 'Calendar',
    x: 640,
    y: 180,
    order: 3,
    config: { requiredAction: 'INTERVIEW' },
  },
  {
    key: 'SELECTED',
    name: 'Selected',
    description: 'Candidate passed interview rounds and has been recommended for hire.',
    type: 'APPROVAL',
    isInitial: false,
    isTerminal: false,
    color: '#10b981',
    icon: 'CheckCircle2',
    x: 920,
    y: 180,
    order: 4,
  },
  {
    key: 'OFFER_PREPARATION',
    name: 'Offer Preparation',
    description: 'Drafting compensation package and generating formal offer letter.',
    type: 'STANDARD',
    isInitial: false,
    isTerminal: false,
    color: '#f59e0b',
    icon: 'FileText',
    x: 1200,
    y: 180,
    order: 5,
    config: { requiredAction: 'OFFER_GENERATION' },
  },
  {
    key: 'OFFER_APPROVAL',
    name: 'Offer Approval',
    description: 'Internal leadership review and compensation sign-off.',
    type: 'APPROVAL',
    isInitial: false,
    isTerminal: false,
    color: '#f97316',
    icon: 'ShieldCheck',
    x: 1480,
    y: 180,
    order: 6,
    config: { requiredAction: 'OFFER_APPROVAL' },
  },
  {
    key: 'OFFER_SENT',
    name: 'Offer Sent',
    description: 'Official offer letter emailed to the candidate with response link.',
    type: 'STANDARD',
    isInitial: false,
    isTerminal: false,
    color: '#06b6d4',
    icon: 'Send',
    x: 1760,
    y: 180,
    order: 7,
  },
  {
    key: 'OFFER_ACCEPTED',
    name: 'Offer Accepted',
    description: 'Candidate signed the offer letter and agreed to the joining date.',
    type: 'STANDARD',
    isInitial: false,
    isTerminal: false,
    color: '#14b8a6',
    icon: 'Award',
    x: 2040,
    y: 180,
    order: 8,
  },
  {
    key: 'EMPLOYEE_CONVERSION',
    name: 'Employee Conversion',
    description: 'Creating official HRMS employee record, generating code and COSEC mapping.',
    type: 'STANDARD',
    isInitial: false,
    isTerminal: false,
    color: '#059669',
    icon: 'UserCheck',
    x: 2320,
    y: 180,
    order: 9,
    config: { requiredAction: 'EMPLOYEE_CONVERSION' },
  },
  {
    key: 'ONBOARDING_COMPLETE',
    name: 'Onboarding Complete',
    description: 'Candidate joined company and completed all required onboarding tasks.',
    type: 'COMPLETED',
    isInitial: false,
    isTerminal: true,
    color: '#15803d',
    icon: 'Sparkles',
    x: 2600,
    y: 180,
    order: 10,
  },
  {
    key: 'REJECTED',
    name: 'Rejected',
    description: 'Candidate did not meet requirements during screening or interview.',
    type: 'REJECTED',
    isInitial: false,
    isTerminal: true,
    color: '#ef4444',
    icon: 'XCircle',
    x: 640,
    y: 440,
    order: 11,
  },
  {
    key: 'OFFER_DECLINED',
    name: 'Offer Declined',
    description: 'Candidate declined the offer letter.',
    type: 'REJECTED',
    isInitial: false,
    isTerminal: true,
    color: '#dc2626',
    icon: 'ThumbsDown',
    x: 1760,
    y: 440,
    order: 12,
  },
  {
    key: 'WITHDRAWN',
    name: 'Withdrawn',
    description: 'Candidate withdrew from the recruitment process.',
    type: 'WITHDRAWN',
    isInitial: false,
    isTerminal: true,
    color: '#64748b',
    icon: 'UserMinus',
    x: 1200,
    y: 440,
    order: 13,
  },
];

interface DefaultTransitionSpec {
  from: string;
  to: string;
  name: string;
  type?: string;
}

const DEFAULT_TRANSITIONS: DefaultTransitionSpec[] = [
  { from: 'APPLICATION_RECEIVED', to: 'SCREENING', name: 'Start Screening' },
  { from: 'SCREENING', to: 'INTERVIEW', name: 'Advance to Interview' },
  { from: 'SCREENING', to: 'REJECTED', name: 'Screening Reject' },
  { from: 'SCREENING', to: 'WITHDRAWN', name: 'Candidate Withdrew' },
  { from: 'INTERVIEW', to: 'SELECTED', name: 'Recommend Selection' },
  { from: 'INTERVIEW', to: 'REJECTED', name: 'Interview Reject' },
  { from: 'INTERVIEW', to: 'WITHDRAWN', name: 'Candidate Withdrew' },
  { from: 'SELECTED', to: 'OFFER_PREPARATION', name: 'Prepare Offer' },
  { from: 'SELECTED', to: 'REJECTED', name: 'Reject' },
  { from: 'SELECTED', to: 'WITHDRAWN', name: 'Candidate Withdrew' },
  { from: 'OFFER_PREPARATION', to: 'OFFER_APPROVAL', name: 'Submit for Approval' },
  { from: 'OFFER_APPROVAL', to: 'OFFER_SENT', name: 'Approved & Send' },
  { from: 'OFFER_APPROVAL', to: 'OFFER_PREPARATION', name: 'Revisions Requested' },
  { from: 'OFFER_SENT', to: 'OFFER_ACCEPTED', name: 'Candidate Accepted' },
  { from: 'OFFER_SENT', to: 'OFFER_DECLINED', name: 'Candidate Declined' },
  { from: 'OFFER_SENT', to: 'WITHDRAWN', name: 'Offer Withdrawn' },
  { from: 'OFFER_ACCEPTED', to: 'EMPLOYEE_CONVERSION', name: 'Convert to Employee' },
  { from: 'EMPLOYEE_CONVERSION', to: 'ONBOARDING_COMPLETE', name: 'Complete Onboarding' },
];

@Injectable()
export class OnboardingWorkflowBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Automatically initializes the default published onboarding workflow for a tenant if none exists.
   * Also safely binds any existing candidates in the tenant to this workflow.
   */
  async ensureDefaultWorkflow(tenantId: string, actorMemberId?: string | null) {
    const existing = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId },
      include: {
        rndtechnosoft_onboarding_workflow_versions: {
          where: { version_status: 'PUBLISHED' },
          orderBy: { version_number: 'desc' },
          take: 1,
        },
      },
    });

    if (existing && existing.rndtechnosoft_onboarding_workflow_versions.length > 0) {
      return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      let workflow = existing;
      if (!workflow) {
        const workflowId = randomUUID();
        workflow = await tx.rndtechnosoft_onboarding_workflows.create({
          data: {
            id: workflowId,
            tenant_id: tenantId,
            workflow_code: DEFAULT_WORKFLOW_CODE,
            name: DEFAULT_WORKFLOW_NAME,
            description:
              'Visual onboarding workflow pipeline from application to employee conversion and completion.',
            is_active: true,
            is_default: true,
            created_by_tenant_member_id: actorMemberId ?? null,
          },
          include: {
            rndtechnosoft_onboarding_workflow_versions: true,
          },
        });
      }

      // Create published version 1
      const publishedVersionId = randomUUID();
      await tx.rndtechnosoft_onboarding_workflow_versions.create({
        data: {
          id: publishedVersionId,
          tenant_id: tenantId,
          workflow_id: workflow.id,
          version_number: 1,
          version_status: 'PUBLISHED',
          change_summary: 'Initial system default onboarding workflow',
          published_by_tenant_member_id: actorMemberId ?? null,
          published_at: new Date(),
          canvas_layout: { zoom: 1, panX: 40, panY: 60 },
        },
      });

      // Insert stages for published version
      const stageKeyToId = new Map<string, string>();
      for (const spec of DEFAULT_STAGES) {
        const stageId = randomUUID();
        stageKeyToId.set(spec.key, stageId);
        await tx.rndtechnosoft_onboarding_workflow_stages.create({
          data: {
            id: stageId,
            tenant_id: tenantId,
            workflow_version_id: publishedVersionId,
            stage_key: spec.key,
            name: spec.name,
            description: spec.description,
            stage_type: spec.type,
            is_initial: spec.isInitial,
            is_terminal: spec.isTerminal,
            color_code: spec.color,
            icon_name: spec.icon,
            position_x: spec.x,
            position_y: spec.y,
            display_order: spec.order,
            stage_config: spec.config ? (spec.config as any) : undefined,
            is_active: true,
          },
        });
      }

      // Insert transitions for published version
      for (const spec of DEFAULT_TRANSITIONS) {
        const fromId = stageKeyToId.get(spec.from);
        const toId = stageKeyToId.get(spec.to);
        if (fromId && toId) {
          await tx.rndtechnosoft_onboarding_workflow_transitions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              workflow_version_id: publishedVersionId,
              from_stage_id: fromId,
              to_stage_id: toId,
              name: spec.name,
              condition_type: spec.type ?? 'DEFAULT',
            },
          });
        }
      }

      // Create active draft version 2 for future visual customization
      const draftVersionId = randomUUID();
      await tx.rndtechnosoft_onboarding_workflow_versions.create({
        data: {
          id: draftVersionId,
          tenant_id: tenantId,
          workflow_id: workflow.id,
          version_number: 2,
          version_status: 'DRAFT',
          change_summary: 'Editable draft of the onboarding workflow',
          canvas_layout: { zoom: 1, panX: 40, panY: 60 },
        },
      });

      const draftStageKeyToId = new Map<string, string>();
      for (const spec of DEFAULT_STAGES) {
        const draftStageId = randomUUID();
        draftStageKeyToId.set(spec.key, draftStageId);
        await tx.rndtechnosoft_onboarding_workflow_stages.create({
          data: {
            id: draftStageId,
            tenant_id: tenantId,
            workflow_version_id: draftVersionId,
            stage_key: spec.key,
            name: spec.name,
            description: spec.description,
            stage_type: spec.type,
            is_initial: spec.isInitial,
            is_terminal: spec.isTerminal,
            color_code: spec.color,
            icon_name: spec.icon,
            position_x: spec.x,
            position_y: spec.y,
            display_order: spec.order,
            stage_config: spec.config ? (spec.config as any) : undefined,
            is_active: true,
          },
        });
      }

      for (const spec of DEFAULT_TRANSITIONS) {
        const fromId = draftStageKeyToId.get(spec.from);
        const toId = draftStageKeyToId.get(spec.to);
        if (fromId && toId) {
          await tx.rndtechnosoft_onboarding_workflow_transitions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              workflow_version_id: draftVersionId,
              from_stage_id: fromId,
              to_stage_id: toId,
              name: spec.name,
              condition_type: spec.type ?? 'DEFAULT',
            },
          });
        }
      }

      // Link any existing candidates that do not have workflow_id set yet
      const candidateList = await tx.rndtechnosoft_candidates.findMany({
        where: { tenant_id: tenantId, workflow_id: null },
        select: { id: true, candidate_status: true },
        take: 500,
      });

      for (const cand of candidateList) {
        // Map legacy candidate_status to corresponding stage
        const matchingStageId =
          stageKeyToId.get(cand.candidate_status) ??
          stageKeyToId.get('APPLICATION_RECEIVED');

        await tx.rndtechnosoft_candidates.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: cand.id } },
          data: {
            workflow_id: workflow.id,
            workflow_version_id: publishedVersionId,
            current_stage_id: matchingStageId,
          },
        });
      }

      return workflow;
    });
  }

  /**
   * Lists all workflows for the current tenant.
   */
  async listWorkflows(tenantId: string, module?: string) {
    await this.ensureDefaultWorkflow(tenantId);

    const where: any = { tenant_id: tenantId };
    if (module && module !== 'ALL') {
      where.module = module.toUpperCase();
    }

    const workflows = await this.prisma.rndtechnosoft_onboarding_workflows.findMany({
      where,
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      include: {
        created_by: {
          select: {
            id: true,
            rndtechnosoft_users: { select: { display_name: true, email: true } },
          },
        },
        rndtechnosoft_onboarding_workflow_versions: {
          orderBy: { version_number: 'desc' },
          select: {
            id: true,
            version_number: true,
            version_status: true,
            published_at: true,
            _count: {
              select: {
                rndtechnosoft_onboarding_workflow_stages: true,
                rndtechnosoft_onboarding_workflow_transitions: true,
              },
            },
          },
        },
        _count: {
          select: {
            rndtechnosoft_candidates: true,
          },
        },
      },
    });

    return workflows.map((wf) => {
      const published = wf.rndtechnosoft_onboarding_workflow_versions.find(
        (v) => v.version_status === 'PUBLISHED',
      );
      const draft = wf.rndtechnosoft_onboarding_workflow_versions.find(
        (v) => v.version_status === 'DRAFT',
      );
      const latest = wf.rndtechnosoft_onboarding_workflow_versions[0];

      return {
        id: wf.id,
        workflowCode: wf.workflow_code,
        name: wf.name,
        description: wf.description,
        module: wf.module || 'ONBOARDING',
        triggerType: wf.trigger_type || 'MANUAL',
        isActive: wf.is_active,
        isDefault: wf.is_default,
        createdAt: wf.created_at,
        updatedAt: wf.updated_at,
        createdByName:
          wf.created_by?.rndtechnosoft_users.display_name ||
          wf.created_by?.rndtechnosoft_users.email ||
          null,
        candidateCount: wf._count.rndtechnosoft_candidates,
        publishedVersion: published
          ? {
              id: published.id,
              versionNumber: published.version_number,
              publishedAt: published.published_at,
              stageCount: published._count.rndtechnosoft_onboarding_workflow_stages,
              transitionCount:
                published._count.rndtechnosoft_onboarding_workflow_transitions,
            }
          : null,
        draftVersion: draft
          ? {
              id: draft.id,
              versionNumber: draft.version_number,
              stageCount: draft._count.rndtechnosoft_onboarding_workflow_stages,
              transitionCount:
                draft._count.rndtechnosoft_onboarding_workflow_transitions,
            }
          : null,
        latestVersionNumber: latest?.version_number ?? 1,
      };
    });
  }

  /**
   * Retrieves full details of a specific workflow, its published version, and its active draft canvas data.
   */
  async getWorkflow(tenantId: string, workflowId: string) {
    await this.ensureDefaultWorkflow(tenantId);

    const workflow = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, id: workflowId },
      include: {
        created_by: {
          select: {
            id: true,
            rndtechnosoft_users: { select: { display_name: true, email: true } },
          },
        },
        rndtechnosoft_onboarding_workflow_versions: {
          orderBy: { version_number: 'desc' },
          include: {
            published_by: {
              select: {
                id: true,
                rndtechnosoft_users: { select: { display_name: true, email: true } },
              },
            },
            rndtechnosoft_onboarding_workflow_stages: {
              orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
            },
            rndtechnosoft_onboarding_workflow_transitions: {
              include: {
                from_stage: { select: { id: true, stage_key: true, name: true } },
                to_stage: { select: { id: true, stage_key: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!workflow) throw new NotFoundException('Workflow not found.');

    const publishedVersion = workflow.rndtechnosoft_onboarding_workflow_versions.find(
      (v) => v.version_status === 'PUBLISHED',
    );
    let draftVersion: any = workflow.rndtechnosoft_onboarding_workflow_versions.find(
      (v) => v.version_status === 'DRAFT',
    );

    // If no draft exists (e.g. freshly published), create a new draft from published
    if (!draftVersion && publishedVersion) {
      draftVersion = await this.createDraftFromPublished(
        tenantId,
        workflow.id,
        publishedVersion,
      );
    }

    return {
      workflow: {
        id: workflow.id,
        workflowCode: workflow.workflow_code,
        name: workflow.name,
        description: workflow.description,
        module: workflow.module || 'ONBOARDING',
        triggerType: workflow.trigger_type || 'MANUAL',
        isActive: workflow.is_active,
        isDefault: workflow.is_default,
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
        createdByName:
          workflow.created_by?.rndtechnosoft_users.display_name ||
          workflow.created_by?.rndtechnosoft_users.email ||
          null,
      },
      publishedVersion: publishedVersion ? this.formatVersion(publishedVersion) : null,
      draftVersion: draftVersion ? this.formatVersion(draftVersion) : null,
      history: workflow.rndtechnosoft_onboarding_workflow_versions
        .filter((v) => v.version_status !== 'DRAFT')
        .map((v) => ({
          id: v.id,
          versionNumber: v.version_number,
          versionStatus: v.version_status,
          publishedAt: v.published_at,
          publishedByName:
            v.published_by?.rndtechnosoft_users.display_name ||
            v.published_by?.rndtechnosoft_users.email ||
            null,
          changeSummary: v.change_summary,
          stageCount: v.rndtechnosoft_onboarding_workflow_stages.length,
          transitionCount: v.rndtechnosoft_onboarding_workflow_transitions.length,
        })),
    };
  }

  /**
   * Returns the currently published default or active onboarding workflow.
   */
  async getActiveWorkflow(tenantId: string) {
    await this.ensureDefaultWorkflow(tenantId);

    const workflow = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, is_active: true },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      include: {
        rndtechnosoft_onboarding_workflow_versions: {
          where: { version_status: 'PUBLISHED' },
          orderBy: { version_number: 'desc' },
          take: 1,
          include: {
            rndtechnosoft_onboarding_workflow_stages: {
              where: { is_active: true },
              orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
            },
            rndtechnosoft_onboarding_workflow_transitions: {
              include: {
                from_stage: { select: { id: true, stage_key: true, name: true } },
                to_stage: { select: { id: true, stage_key: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!workflow || workflow.rndtechnosoft_onboarding_workflow_versions.length === 0) {
      throw new NotFoundException('No active published onboarding workflow found.');
    }

    const version = workflow.rndtechnosoft_onboarding_workflow_versions[0];
    return {
      workflow: {
        id: workflow.id,
        workflowCode: workflow.workflow_code,
        name: workflow.name,
        description: workflow.description,
        isActive: workflow.is_active,
        isDefault: workflow.is_default,
      },
      version: this.formatVersion(version),
    };
  }

  /**
   * Creates a new onboarding workflow definition with initial draft.
   */
  async createWorkflow(
    tenantId: string,
    dto: CreateWorkflowDto,
    actor: AuthenticatedTenantUser,
  ) {
    const slug = (
      dto.workflowCode ||
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    ).slice(0, 64);

    const existingCode = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, workflow_code: slug },
    });
    if (existingCode) {
      throw new ConflictException(
        `A workflow with code '${slug}' already exists in this organization.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.rndtechnosoft_onboarding_workflows.updateMany({
          where: { tenant_id: tenantId, is_default: true },
          data: { is_default: false },
        });
      }

      const workflowId = randomUUID();
      const workflow = await tx.rndtechnosoft_onboarding_workflows.create({
        data: {
          id: workflowId,
          tenant_id: tenantId,
          workflow_code: slug,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          module: (dto.module || 'ONBOARDING').toUpperCase(),
          trigger_type: (dto.triggerType || 'MANUAL').toUpperCase(),
          is_active: true,
          is_default: Boolean(dto.isDefault),
          created_by_tenant_member_id: actor.tenantMemberId,
        },
      });

      // Seed starter draft with start and end stages
      const draftId = randomUUID();
      await tx.rndtechnosoft_onboarding_workflow_versions.create({
        data: {
          id: draftId,
          tenant_id: tenantId,
          workflow_id: workflow.id,
          version_number: 1,
          version_status: 'DRAFT',
          change_summary: 'Initial draft',
          canvas_layout: { zoom: 1, panX: 40, panY: 60 },
        },
      });

      const startStageId = randomUUID();
      const completeStageId = randomUUID();

      await tx.rndtechnosoft_onboarding_workflow_stages.createMany({
        data: [
          {
            id: startStageId,
            tenant_id: tenantId,
            workflow_version_id: draftId,
            stage_key: 'APPLICATION_RECEIVED',
            name: 'Application Received',
            description: 'Candidate initial entry point',
            stage_type: 'START',
            is_initial: true,
            is_terminal: false,
            color_code: '#0ea5e9',
            icon_name: 'Inbox',
            position_x: 100,
            position_y: 200,
            display_order: 1,
            is_active: true,
          },
          {
            id: completeStageId,
            tenant_id: tenantId,
            workflow_version_id: draftId,
            stage_key: 'ONBOARDING_COMPLETE',
            name: 'Onboarding Complete',
            description: 'Onboarding finished successfully',
            stage_type: 'COMPLETED',
            is_initial: false,
            is_terminal: true,
            color_code: '#10b981',
            icon_name: 'CheckCircle2',
            position_x: 600,
            position_y: 200,
            display_order: 2,
            is_active: true,
          },
        ],
      });

      await tx.rndtechnosoft_onboarding_workflow_transitions.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          workflow_version_id: draftId,
          from_stage_id: startStageId,
          to_stage_id: completeStageId,
          name: 'Complete',
          condition_type: 'DEFAULT',
        },
      });

      await this.audit.log({
        tenantId,
        actorUserId: actor.userId,
        actorTenantMemberId: actor.tenantMemberId,
        actionCode: 'ONBOARDING_WORKFLOW_CREATED',
        entityType: 'ONBOARDING_WORKFLOW',
        entityId: workflow.id,
        newValues: { name: workflow.name, workflowCode: workflow.workflow_code },
      });

      return this.getWorkflow(tenantId, workflow.id);
    });
  }

  /**
   * Duplicates an existing workflow.
   */
  async duplicateWorkflow(
    tenantId: string,
    workflowId: string,
    actor: AuthenticatedTenantUser,
  ) {
    const source = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, id: workflowId },
      include: {
        rndtechnosoft_onboarding_workflow_versions: {
          orderBy: { version_number: 'desc' },
          include: {
            rndtechnosoft_onboarding_workflow_stages: true,
            rndtechnosoft_onboarding_workflow_transitions: true,
          },
        },
      },
    });

    if (!source) throw new NotFoundException('Workflow to duplicate not found.');

    const sourceVersion =
      source.rndtechnosoft_onboarding_workflow_versions.find(
        (v) => v.version_status === 'PUBLISHED',
      ) || source.rndtechnosoft_onboarding_workflow_versions[0];

    if (!sourceVersion) {
      throw new BadRequestException('Source workflow has no versions to copy.');
    }

    const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
    const newName = `${source.name} (Copy)`;
    const newCode = `${source.workflow_code}-copy-${uniqueSuffix}`.slice(0, 64);

    return this.prisma.$transaction(async (tx) => {
      const newWfId = randomUUID();
      const newWorkflow = await tx.rndtechnosoft_onboarding_workflows.create({
        data: {
          id: newWfId,
          tenant_id: tenantId,
          workflow_code: newCode,
          name: newName,
          description: source.description,
          module: source.module,
          trigger_type: source.trigger_type,
          is_active: true,
          is_default: false,
          created_by_tenant_member_id: actor.tenantMemberId,
        },
      });

      const newDraftId = randomUUID();
      await tx.rndtechnosoft_onboarding_workflow_versions.create({
        data: {
          id: newDraftId,
          tenant_id: tenantId,
          workflow_id: newWorkflow.id,
          version_number: 1,
          version_status: 'DRAFT',
          change_summary: `Cloned from ${source.name} v${sourceVersion.version_number}`,
          canvas_layout: sourceVersion.canvas_layout as any,
        },
      });

      const oldStageIdToNewId = new Map<string, string>();
      for (const stg of sourceVersion.rndtechnosoft_onboarding_workflow_stages) {
        const newStageId = randomUUID();
        oldStageIdToNewId.set(stg.id, newStageId);
        await tx.rndtechnosoft_onboarding_workflow_stages.create({
          data: {
            id: newStageId,
            tenant_id: tenantId,
            workflow_version_id: newDraftId,
            stage_key: stg.stage_key,
            name: stg.name,
            description: stg.description,
            stage_type: stg.stage_type,
            is_initial: stg.is_initial,
            is_terminal: stg.is_terminal,
            color_code: stg.color_code,
            icon_name: stg.icon_name,
            position_x: stg.position_x,
            position_y: stg.position_y,
            display_order: stg.display_order,
            stage_config: stg.stage_config as any,
            is_active: stg.is_active,
          },
        });
      }

      for (const tr of sourceVersion.rndtechnosoft_onboarding_workflow_transitions) {
        const fromId = oldStageIdToNewId.get(tr.from_stage_id);
        const toId = oldStageIdToNewId.get(tr.to_stage_id);
        if (fromId && toId) {
          await tx.rndtechnosoft_onboarding_workflow_transitions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              workflow_version_id: newDraftId,
              from_stage_id: fromId,
              to_stage_id: toId,
              name: tr.name,
              condition_type: tr.condition_type,
              transition_config: tr.transition_config as any,
            },
          });
        }
      }

      await this.audit.log({
        tenantId,
        actorUserId: actor.userId,
        actorTenantMemberId: actor.tenantMemberId,
        actionCode: 'ONBOARDING_WORKFLOW_DUPLICATED',
        entityType: 'ONBOARDING_WORKFLOW',
        entityId: newWorkflow.id,
        newValues: { sourceWorkflowId: workflowId, newWorkflowId: newWorkflow.id },
      });

      return this.getWorkflow(tenantId, newWorkflow.id);
    });
  }

  /**
   * Updates workflow settings (name, description, active, default).
   */
  async updateWorkflow(
    tenantId: string,
    workflowId: string,
    dto: UpdateWorkflowDto,
    actor: AuthenticatedTenantUser,
  ) {
    const existing = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, id: workflowId },
    });
    if (!existing) throw new NotFoundException('Workflow not found.');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.rndtechnosoft_onboarding_workflows.updateMany({
          where: { tenant_id: tenantId, is_default: true },
          data: { is_default: false },
        });
      }

      const updated = await tx.rndtechnosoft_onboarding_workflows.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: workflowId } },
        data: {
          name: dto.name?.trim() || existing.name,
          description:
            dto.description !== undefined
              ? dto.description?.trim() || null
              : existing.description,
          module: dto.module !== undefined ? dto.module.toUpperCase() : existing.module,
          trigger_type: dto.triggerType !== undefined ? dto.triggerType.toUpperCase() : existing.trigger_type,
          is_active: dto.isActive !== undefined ? dto.isActive : existing.is_active,
          is_default: dto.isDefault !== undefined ? dto.isDefault : existing.is_default,
          updated_at: new Date(),
        },
      });

      await this.audit.log({
        tenantId,
        actorUserId: actor.userId,
        actorTenantMemberId: actor.tenantMemberId,
        actionCode: 'ONBOARDING_WORKFLOW_UPDATED',
        entityType: 'ONBOARDING_WORKFLOW',
        entityId: workflowId,
        oldValues: { name: existing.name, isDefault: existing.is_default },
        newValues: { name: updated.name, isDefault: updated.is_default },
      });

      return this.getWorkflow(tenantId, workflowId);
    });
  }

  /**
   * Deactivates or removes a workflow safely.
   */
  async deleteWorkflow(
    tenantId: string,
    workflowId: string,
    actor: AuthenticatedTenantUser,
  ) {
    const existing = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, id: workflowId },
      include: {
        _count: {
          select: { rndtechnosoft_candidates: true },
        },
      },
    });

    if (!existing) throw new NotFoundException('Workflow not found.');
    if (existing.is_default) {
      throw new ConflictException(
        'The default workflow cannot be deleted. Designate another default workflow first.',
      );
    }
    if (existing._count.rndtechnosoft_candidates > 0) {
      // Soft-archive by deactivating
      await this.prisma.rndtechnosoft_onboarding_workflows.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: workflowId } },
        data: { is_active: false, updated_at: new Date() },
      });
      return {
        success: true,
        archived: true,
        message: `Workflow has ${existing._count.rndtechnosoft_candidates} associated candidates and was deactivated instead of deleted.`,
      };
    }

    await this.prisma.rndtechnosoft_onboarding_workflows.delete({
      where: { tenant_id_id: { tenant_id: tenantId, id: workflowId } },
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_WORKFLOW_DELETED',
      entityType: 'ONBOARDING_WORKFLOW',
      entityId: workflowId,
      oldValues: { name: existing.name, workflowCode: existing.workflow_code },
    });

    return { success: true, message: 'Workflow deleted successfully.' };
  }

  /**
   * Saves the visual draft canvas (stages with coordinates, configs, and transitions).
   */
  async saveDraft(
    tenantId: string,
    workflowId: string,
    dto: SaveWorkflowDraftDto,
    actor: AuthenticatedTenantUser,
  ) {
    const workflow = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, id: workflowId },
      include: {
        rndtechnosoft_onboarding_workflow_versions: {
          where: { version_status: 'DRAFT' },
          take: 1,
        },
      },
    });

    if (!workflow) throw new NotFoundException('Workflow not found.');

    let draft = workflow.rndtechnosoft_onboarding_workflow_versions[0];

    return this.prisma.$transaction(async (tx) => {
      if (!draft) {
        // Find latest version number
        const latestVersion =
          await tx.rndtechnosoft_onboarding_workflow_versions.findFirst({
            where: { tenant_id: tenantId, workflow_id: workflowId },
            orderBy: { version_number: 'desc' },
          });

        const nextNumber = (latestVersion?.version_number ?? 0) + 1;
        draft = await tx.rndtechnosoft_onboarding_workflow_versions.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            workflow_id: workflowId,
            version_number: nextNumber,
            version_status: 'DRAFT',
            change_summary: dto.changeSummary || 'Canvas draft update',
            canvas_layout: (dto.canvasLayout as any) || null,
          },
        });
      } else {
        await tx.rndtechnosoft_onboarding_workflow_versions.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } },
          data: {
            change_summary: dto.changeSummary || draft.change_summary,
            canvas_layout: (dto.canvasLayout as any) || (draft.canvas_layout as any),
            updated_at: new Date(),
          },
        });
      }

      // Delete existing draft transitions and stages
      await tx.rndtechnosoft_onboarding_workflow_transitions.deleteMany({
        where: { tenant_id: tenantId, workflow_version_id: draft.id },
      });
      await tx.rndtechnosoft_onboarding_workflow_stages.deleteMany({
        where: { tenant_id: tenantId, workflow_version_id: draft.id },
      });

      // Insert updated stages
      const stageKeyToId = new Map<string, string>();
      for (let i = 0; i < dto.stages.length; i++) {
        const stageDto = dto.stages[i];
        const stageId = stageDto.id && stageDto.id.length === 36 ? stageDto.id : randomUUID();
        stageKeyToId.set(stageDto.stageKey, stageId);

        await tx.rndtechnosoft_onboarding_workflow_stages.create({
          data: {
            id: stageId,
            tenant_id: tenantId,
            workflow_version_id: draft.id,
            stage_key: stageDto.stageKey,
            name: stageDto.name.trim(),
            description: stageDto.description?.trim() || null,
            stage_type: stageDto.stageType,
            is_initial: Boolean(stageDto.isInitial),
            is_terminal: Boolean(stageDto.isTerminal),
            color_code: stageDto.colorCode || null,
            icon_name: stageDto.iconName || null,
            position_x: stageDto.positionX ?? 0,
            position_y: stageDto.positionY ?? 0,
            display_order: stageDto.displayOrder ?? i + 1,
            stage_config: stageDto.stageConfig ? (stageDto.stageConfig as any) : null,
            is_active: stageDto.isActive !== undefined ? stageDto.isActive : true,
          },
        });
      }

      // Insert updated transitions
      for (const transDto of dto.transitions) {
        const fromId = stageKeyToId.get(transDto.fromStageKey);
        const toId = stageKeyToId.get(transDto.toStageKey);

        if (fromId && toId) {
          await tx.rndtechnosoft_onboarding_workflow_transitions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              workflow_version_id: draft.id,
              from_stage_id: fromId,
              to_stage_id: toId,
              name: transDto.name?.trim() || null,
              condition_type: transDto.conditionType || 'DEFAULT',
              transition_config: transDto.transitionConfig
                ? (transDto.transitionConfig as any)
                : null,
            },
          });
        }
      }

      return this.getWorkflow(tenantId, workflowId);
    });
  }

  /**
   * Validates a workflow draft for graph integrity before publishing.
   */
  async validateWorkflow(tenantId: string, workflowId: string): Promise<WorkflowValidationResult> {
    const workflow = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, id: workflowId },
      include: {
        rndtechnosoft_onboarding_workflow_versions: {
          where: { version_status: 'DRAFT' },
          take: 1,
          include: {
            rndtechnosoft_onboarding_workflow_stages: true,
            rndtechnosoft_onboarding_workflow_transitions: true,
          },
        },
      },
    });

    if (!workflow || workflow.rndtechnosoft_onboarding_workflow_versions.length === 0) {
      return {
        isValid: false,
        errors: ['No editable draft found to validate.'],
        warnings: [],
        stats: {
          stageCount: 0,
          transitionCount: 0,
          initialStages: [],
          terminalStages: [],
          unreachableStages: [],
        },
      };
    }

    const draft = workflow.rndtechnosoft_onboarding_workflow_versions[0];
    const stages = draft.rndtechnosoft_onboarding_workflow_stages;
    const transitions = draft.rndtechnosoft_onboarding_workflow_transitions;

    const errors: string[] = [];
    const warnings: string[] = [];

    if (stages.length === 0) {
      errors.push('The workflow must contain at least one stage.');
      return {
        isValid: false,
        errors,
        warnings,
        stats: {
          stageCount: 0,
          transitionCount: 0,
          initialStages: [],
          terminalStages: [],
          unreachableStages: [],
        },
      };
    }

    // 1. Initial stage check
    const initialStages = stages.filter((s) => s.is_initial || s.stage_type === 'START');
    if (initialStages.length === 0) {
      errors.push('The workflow must have exactly one starting stage (mark a stage as Initial/Start).');
    } else if (initialStages.length > 1) {
      errors.push(
        `Multiple starting stages detected: ${initialStages.map((s) => s.name).join(', ')}. Exactly one is required.`,
      );
    }

    // 2. Terminal stage check
    const terminalStages = stages.filter(
      (s) =>
        s.is_terminal ||
        ['COMPLETED', 'REJECTED', 'WITHDRAWN'].includes(s.stage_type),
    );
    if (terminalStages.length === 0) {
      errors.push('The workflow must have at least one terminal stage (e.g. Completed, Rejected, or Withdrawn).');
    }

    // 3. Stage Key Uniqueness
    const keySet = new Set<string>();
    for (const stg of stages) {
      if (keySet.has(stg.stage_key)) {
        errors.push(`Duplicate stage key detected: '${stg.stage_key}'. Stage keys must be unique.`);
      }
      keySet.add(stg.stage_key);
    }

    // 4. Transitions validation
    const stageIdMap = new Map(stages.map((s) => [s.id, s]));
    const outgoingMap = new Map<string, string[]>();
    const incomingMap = new Map<string, string[]>();

    for (const tr of transitions) {
      if (!stageIdMap.has(tr.from_stage_id) || !stageIdMap.has(tr.to_stage_id)) {
        errors.push('One or more connections reference non-existent stages.');
        continue;
      }

      if (tr.from_stage_id === tr.to_stage_id) {
        warnings.push(`Self-referencing transition on stage '${stageIdMap.get(tr.from_stage_id)?.name}'.`);
      }

      const outList = outgoingMap.get(tr.from_stage_id) || [];
      outList.push(tr.to_stage_id);
      outgoingMap.set(tr.from_stage_id, outList);

      const inList = incomingMap.get(tr.to_stage_id) || [];
      inList.push(tr.from_stage_id);
      incomingMap.set(tr.to_stage_id, inList);
    }

    // Check terminal stages with outgoing transitions
    for (const term of terminalStages) {
      const out = outgoingMap.get(term.id) || [];
      if (out.length > 0) {
        warnings.push(
          `Terminal stage '${term.name}' has outgoing transitions. Candidates reaching a terminal stage normally do not progress further.`,
        );
      }
    }

    // Check non-terminal stages without outgoing transitions
    for (const stg of stages) {
      if (!terminalStages.includes(stg)) {
        const out = outgoingMap.get(stg.id) || [];
        if (out.length === 0) {
          warnings.push(`Stage '${stg.name}' has no outgoing transitions.`);
        }
      }
    }

    // 5. Reachability BFS from Initial Stage
    const reachable = new Set<string>();
    if (initialStages.length === 1) {
      const queue = [initialStages[0].id];
      reachable.add(initialStages[0].id);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = outgoingMap.get(curr) || [];
        for (const next of neighbors) {
          if (!reachable.has(next)) {
            reachable.add(next);
            queue.push(next);
          }
        }
      }
    }

    const unreachable = stages.filter((s) => !reachable.has(s.id));
    if (unreachable.length > 0) {
      warnings.push(
        `${unreachable.length} stage(s) are unreachable from the start stage: ${unreachable.map((s) => s.name).join(', ')}.`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      stats: {
        stageCount: stages.length,
        transitionCount: transitions.length,
        initialStages: initialStages.map((s) => s.name),
        terminalStages: terminalStages.map((s) => s.name),
        unreachableStages: unreachable.map((s) => s.name),
      },
    };
  }

  /**
   * Publishes the current draft into a new immutable published version.
   */
  async publishWorkflow(
    tenantId: string,
    workflowId: string,
    dto: PublishWorkflowDto,
    actor: AuthenticatedTenantUser,
  ) {
    const validation = await this.validateWorkflow(tenantId, workflowId);
    if (!validation.isValid) {
      throw new BadRequestException(
        `Cannot publish invalid workflow: ${validation.errors.join(' ')}`,
      );
    }

    const workflow = await this.prisma.rndtechnosoft_onboarding_workflows.findFirst({
      where: { tenant_id: tenantId, id: workflowId },
      include: {
        rndtechnosoft_onboarding_workflow_versions: {
          where: { version_status: 'DRAFT' },
          take: 1,
          include: {
            rndtechnosoft_onboarding_workflow_stages: true,
            rndtechnosoft_onboarding_workflow_transitions: true,
          },
        },
      },
    });

    if (!workflow || workflow.rndtechnosoft_onboarding_workflow_versions.length === 0) {
      throw new NotFoundException('No draft version found to publish.');
    }

    const draft = workflow.rndtechnosoft_onboarding_workflow_versions[0];

    return this.prisma.$transaction(async (tx) => {
      // 1. Archive previously published version(s)
      await tx.rndtechnosoft_onboarding_workflow_versions.updateMany({
        where: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          version_status: 'PUBLISHED',
        },
        data: { version_status: 'ARCHIVED', updated_at: new Date() },
      });

      // 2. Mark this draft as PUBLISHED
      const published = await tx.rndtechnosoft_onboarding_workflow_versions.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } },
        data: {
          version_status: 'PUBLISHED',
          change_summary: dto.changeSummary || draft.change_summary || 'Published version',
          published_by_tenant_member_id: actor.tenantMemberId,
          published_at: new Date(),
          updated_at: new Date(),
        },
      });

      // 3. Spawn a new draft version (version_number + 1) copied from the published version
      const nextVersionNum = published.version_number + 1;
      const newDraftId = randomUUID();

      await tx.rndtechnosoft_onboarding_workflow_versions.create({
        data: {
          id: newDraftId,
          tenant_id: tenantId,
          workflow_id: workflowId,
          version_number: nextVersionNum,
          version_status: 'DRAFT',
          change_summary: `Draft copy of version ${published.version_number}`,
          canvas_layout: published.canvas_layout as any,
        },
      });

      // Clone stages to new draft
      const stageMap = new Map<string, string>();
      for (const stg of draft.rndtechnosoft_onboarding_workflow_stages) {
        const newStgId = randomUUID();
        stageMap.set(stg.id, newStgId);
        await tx.rndtechnosoft_onboarding_workflow_stages.create({
          data: {
            id: newStgId,
            tenant_id: tenantId,
            workflow_version_id: newDraftId,
            stage_key: stg.stage_key,
            name: stg.name,
            description: stg.description,
            stage_type: stg.stage_type,
            is_initial: stg.is_initial,
            is_terminal: stg.is_terminal,
            color_code: stg.color_code,
            icon_name: stg.icon_name,
            position_x: stg.position_x,
            position_y: stg.position_y,
            display_order: stg.display_order,
            stage_config: stg.stage_config as any,
            is_active: stg.is_active,
          },
        });
      }

      // Clone transitions to new draft
      for (const tr of draft.rndtechnosoft_onboarding_workflow_transitions) {
        const fromId = stageMap.get(tr.from_stage_id);
        const toId = stageMap.get(tr.to_stage_id);
        if (fromId && toId) {
          await tx.rndtechnosoft_onboarding_workflow_transitions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              workflow_version_id: newDraftId,
              from_stage_id: fromId,
              to_stage_id: toId,
              name: tr.name,
              condition_type: tr.condition_type,
              transition_config: tr.transition_config as any,
            },
          });
        }
      }

      await this.audit.log({
        tenantId,
        actorUserId: actor.userId,
        actorTenantMemberId: actor.tenantMemberId,
        actionCode: 'ONBOARDING_WORKFLOW_PUBLISHED',
        entityType: 'ONBOARDING_WORKFLOW_VERSION',
        entityId: published.id,
        newValues: {
          workflowId,
          versionNumber: published.version_number,
          stageCount: draft.rndtechnosoft_onboarding_workflow_stages.length,
        },
      });

      return this.getWorkflow(tenantId, workflowId);
    });
  }

  /**
   * Helper to clone an existing published version into a new draft.
   */
  private async createDraftFromPublished(
    tenantId: string,
    workflowId: string,
    published: any,
  ) {
    const nextVersionNum = published.version_number + 1;
    const newDraftId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.rndtechnosoft_onboarding_workflow_versions.create({
        data: {
          id: newDraftId,
          tenant_id: tenantId,
          workflow_id: workflowId,
          version_number: nextVersionNum,
          version_status: 'DRAFT',
          change_summary: `Draft copy of v${published.version_number}`,
          canvas_layout: published.canvas_layout as any,
        },
        include: {
          rndtechnosoft_onboarding_workflow_stages: true,
          rndtechnosoft_onboarding_workflow_transitions: {
            include: {
              from_stage: { select: { id: true, stage_key: true, name: true } },
              to_stage: { select: { id: true, stage_key: true, name: true } },
            },
          },
        },
      });

      const stageMap = new Map<string, string>();
      for (const stg of published.rndtechnosoft_onboarding_workflow_stages) {
        const newStgId = randomUUID();
        stageMap.set(stg.id, newStgId);
        await tx.rndtechnosoft_onboarding_workflow_stages.create({
          data: {
            id: newStgId,
            tenant_id: tenantId,
            workflow_version_id: newDraftId,
            stage_key: stg.stage_key,
            name: stg.name,
            description: stg.description,
            stage_type: stg.stage_type,
            is_initial: stg.is_initial,
            is_terminal: stg.is_terminal,
            color_code: stg.color_code,
            icon_name: stg.icon_name,
            position_x: stg.position_x,
            position_y: stg.position_y,
            display_order: stg.display_order,
            stage_config: stg.stage_config as any,
            is_active: stg.is_active,
          },
        });
      }

      for (const tr of published.rndtechnosoft_onboarding_workflow_transitions) {
        const fromId = stageMap.get(tr.from_stage_id);
        const toId = stageMap.get(tr.to_stage_id);
        if (fromId && toId) {
          await tx.rndtechnosoft_onboarding_workflow_transitions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              workflow_version_id: newDraftId,
              from_stage_id: fromId,
              to_stage_id: toId,
              name: tr.name,
              condition_type: tr.condition_type,
              transition_config: tr.transition_config as any,
            },
          });
        }
      }

      return this.prisma.rndtechnosoft_onboarding_workflow_versions.findFirst({
        where: { tenant_id: tenantId, id: newDraftId },
        include: {
          rndtechnosoft_onboarding_workflow_stages: {
            orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
          },
          rndtechnosoft_onboarding_workflow_transitions: {
            include: {
              from_stage: { select: { id: true, stage_key: true, name: true } },
              to_stage: { select: { id: true, stage_key: true, name: true } },
            },
          },
        },
      });
    });
  }

  /**
   * Returns valid next stages and override stage choices for a candidate.
   */
  async getCandidateStageOptions(tenantId: string, candidateId: string) {
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      include: {
        current_stage: true,
        rndtechnosoft_onboarding_workflows: true,
        rndtechnosoft_onboarding_workflow_versions: {
          include: {
            rndtechnosoft_onboarding_workflow_stages: {
              where: { is_active: true },
              orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
            },
            rndtechnosoft_onboarding_workflow_transitions: {
              include: {
                from_stage: true,
                to_stage: true,
              },
            },
          },
        },
      },
    });

    if (!candidate) throw new NotFoundException('Candidate not found.');

    // If candidate has no workflow version assigned, resolve active workflow
    let version = candidate.rndtechnosoft_onboarding_workflow_versions;
    let workflow = candidate.rndtechnosoft_onboarding_workflows;

    if (!version) {
      const active = await this.getActiveWorkflow(tenantId);
      const fullVersion = await this.prisma.rndtechnosoft_onboarding_workflow_versions.findFirst({
        where: { tenant_id: tenantId, id: active.version.id },
        include: {
          rndtechnosoft_onboarding_workflow_stages: {
            where: { is_active: true },
            orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }],
          },
          rndtechnosoft_onboarding_workflow_transitions: {
            include: {
              from_stage: true,
              to_stage: true,
            },
          },
        },
      });
      version = fullVersion;
      workflow = active.workflow as any;

      // Bind candidate to active workflow
      const matchingStage =
        version?.rndtechnosoft_onboarding_workflow_stages.find(
          (s) => s.stage_key === candidate.candidate_status,
        ) ||
        version?.rndtechnosoft_onboarding_workflow_stages.find((s) => s.is_initial);

      if (version && workflow) {
        await this.prisma.rndtechnosoft_candidates.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: candidateId } },
          data: {
            workflow_id: workflow.id,
            workflow_version_id: version.id,
            current_stage_id: matchingStage?.id ?? null,
          },
        });
      }
    }

    if (!version) {
      throw new NotFoundException('Workflow configuration not available.');
    }

    const allStages = version.rndtechnosoft_onboarding_workflow_stages;
    const currentStage =
      candidate.current_stage ||
      allStages.find((s) => s.id === candidate.current_stage_id) ||
      allStages.find((s) => s.stage_key === candidate.candidate_status) ||
      allStages[0];

    // Find outgoing transitions from current stage
    const outgoing = version.rndtechnosoft_onboarding_workflow_transitions.filter(
      (t) => t.from_stage_id === currentStage?.id,
    );

    const validNextStages = outgoing
      .map((t) => {
        const dest = allStages.find((s) => s.id === t.to_stage_id);
        if (!dest) return null;
        return {
          id: dest.id,
          stageKey: dest.stage_key,
          name: dest.name,
          description: dest.description,
          stageType: dest.stage_type,
          isTerminal: dest.is_terminal,
          colorCode: dest.color_code,
          iconName: dest.icon_name,
          transitionName: t.name || `Move to ${dest.name}`,
          stageConfig: dest.stage_config,
        };
      })
      .filter(Boolean);

    return {
      candidate: {
        id: candidate.id,
        fullName: candidate.full_name,
        candidateCode: candidate.candidate_code,
        status: candidate.candidate_status,
        archivedAt: candidate.archived_at,
      },
      workflow: {
        id: workflow?.id ?? version.workflow_id,
        name: workflow?.name ?? 'Onboarding Workflow',
        versionNumber: version.version_number,
        versionId: version.id,
      },
      currentStage: currentStage
        ? {
            id: currentStage.id,
            stageKey: currentStage.stage_key,
            name: currentStage.name,
            description: currentStage.description,
            stageType: currentStage.stage_type,
            isInitial: currentStage.is_initial,
            isTerminal: currentStage.is_terminal,
            colorCode: currentStage.color_code,
            iconName: currentStage.icon_name,
            stageConfig: currentStage.stage_config,
          }
        : null,
      validNextStages,
      allStages: allStages
        .filter((s) => s.id !== currentStage?.id)
        .map((s) => ({
          id: s.id,
          stageKey: s.stage_key,
          name: s.name,
          stageType: s.stage_type,
          isTerminal: s.is_terminal,
          colorCode: s.color_code,
          iconName: s.icon_name,
        })),
    };
  }

  /**
   * Formats a workflow version for frontend consumption.
   */
  private formatVersion(v: any) {
    return {
      id: v.id,
      versionNumber: v.version_number,
      versionStatus: v.version_status,
      changeSummary: v.change_summary,
      publishedAt: v.published_at,
      publishedByName:
        v.published_by?.rndtechnosoft_users.display_name ||
        v.published_by?.rndtechnosoft_users.email ||
        null,
      canvasLayout: v.canvas_layout || { zoom: 1, panX: 0, panY: 0 },
      stages: v.rndtechnosoft_onboarding_workflow_stages.map((stg: any) => ({
        id: stg.id,
        stageKey: stg.stage_key,
        name: stg.name,
        description: stg.description,
        stageType: stg.stage_type,
        isInitial: stg.is_initial,
        isTerminal: stg.is_terminal,
        colorCode: stg.color_code,
        iconName: stg.icon_name,
        positionX: stg.position_x,
        positionY: stg.position_y,
        displayOrder: stg.display_order,
        stageConfig: stg.stage_config,
        isActive: stg.is_active,
      })),
      transitions: v.rndtechnosoft_onboarding_workflow_transitions.map((tr: any) => ({
        id: tr.id,
        fromStageId: tr.from_stage_id,
        toStageId: tr.to_stage_id,
        fromStageKey: tr.from_stage?.stage_key ?? null,
        toStageKey: tr.to_stage?.stage_key ?? null,
        name: tr.name,
        conditionType: tr.condition_type,
        transitionConfig: tr.transition_config,
      })),
    };
  }
}
