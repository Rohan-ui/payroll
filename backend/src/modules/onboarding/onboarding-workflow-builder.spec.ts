import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OnboardingWorkflowBuilderService } from './onboarding-workflow-builder.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';

describe('OnboardingWorkflowBuilderService', () => {
  let service: OnboardingWorkflowBuilderService;
  let prisma: any;
  let audit: any;

  const mockTenantId = '74f9eb2a-25b2-48a6-972d-16359e24a85c';
  const mockActor: any = {
    userId: '361e044b-5f5c-45c6-979d-37d23d8b93ae',
    tenantMemberId: '11111111-1111-1111-1111-111111111111',
  };

  beforeEach(async () => {
    prisma = {
      rndtechnosoft_onboarding_workflows: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      rndtechnosoft_onboarding_workflow_versions: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      rndtechnosoft_onboarding_workflow_stages: {
        findMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      rndtechnosoft_onboarding_workflow_transitions: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      rndtechnosoft_candidates: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };

    audit = {
      log: (jest.fn() as any).mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingWorkflowBuilderService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<OnboardingWorkflowBuilderService>(OnboardingWorkflowBuilderService);
  });

  describe('Validation of workflow graph', () => {
    it('rejects a workflow with no stages', async () => {
      prisma.rndtechnosoft_onboarding_workflows.findFirst.mockResolvedValue({
        id: 'wf-1',
        tenant_id: mockTenantId,
        rndtechnosoft_onboarding_workflow_versions: [
          {
            id: 'ver-1',
            version_status: 'DRAFT',
            rndtechnosoft_onboarding_workflow_stages: [],
            rndtechnosoft_onboarding_workflow_transitions: [],
          },
        ],
      });

      const result = await service.validateWorkflow(mockTenantId, 'wf-1');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('The workflow must contain at least one stage.');
    });

    it('rejects a workflow without a start stage', async () => {
      prisma.rndtechnosoft_onboarding_workflows.findFirst.mockResolvedValue({
        id: 'wf-1',
        tenant_id: mockTenantId,
        rndtechnosoft_onboarding_workflow_versions: [
          {
            id: 'ver-1',
            version_status: 'DRAFT',
            rndtechnosoft_onboarding_workflow_stages: [
              {
                id: 's-1',
                stage_key: 'INTERVIEW',
                name: 'Interview',
                stage_type: 'STANDARD',
                is_initial: false,
                is_terminal: false,
              },
              {
                id: 's-2',
                stage_key: 'COMPLETE',
                name: 'Complete',
                stage_type: 'COMPLETED',
                is_initial: false,
                is_terminal: true,
              },
            ],
            rndtechnosoft_onboarding_workflow_transitions: [
              { from_stage_id: 's-1', to_stage_id: 's-2' },
            ],
          },
        ],
      });

      const result = await service.validateWorkflow(mockTenantId, 'wf-1');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('starting stage'))).toBe(true);
    });

    it('rejects a workflow without a terminal stage', async () => {
      prisma.rndtechnosoft_onboarding_workflows.findFirst.mockResolvedValue({
        id: 'wf-1',
        tenant_id: mockTenantId,
        rndtechnosoft_onboarding_workflow_versions: [
          {
            id: 'ver-1',
            version_status: 'DRAFT',
            rndtechnosoft_onboarding_workflow_stages: [
              {
                id: 's-1',
                stage_key: 'APPLICATION_RECEIVED',
                name: 'Application Received',
                stage_type: 'START',
                is_initial: true,
                is_terminal: false,
              },
              {
                id: 's-2',
                stage_key: 'SCREENING',
                name: 'Screening',
                stage_type: 'STANDARD',
                is_initial: false,
                is_terminal: false,
              },
            ],
            rndtechnosoft_onboarding_workflow_transitions: [
              { from_stage_id: 's-1', to_stage_id: 's-2' },
            ],
          },
        ],
      });

      const result = await service.validateWorkflow(mockTenantId, 'wf-1');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('terminal stage'))).toBe(true);
    });

    it('passes validation when valid start, transitions and terminal stage exist', async () => {
      prisma.rndtechnosoft_onboarding_workflows.findFirst.mockResolvedValue({
        id: 'wf-1',
        tenant_id: mockTenantId,
        rndtechnosoft_onboarding_workflow_versions: [
          {
            id: 'ver-1',
            version_status: 'DRAFT',
            rndtechnosoft_onboarding_workflow_stages: [
              {
                id: 's-1',
                stage_key: 'APPLICATION_RECEIVED',
                name: 'Application Received',
                stage_type: 'START',
                is_initial: true,
                is_terminal: false,
              },
              {
                id: 's-2',
                stage_key: 'SCREENING',
                name: 'Screening',
                stage_type: 'STANDARD',
                is_initial: false,
                is_terminal: false,
              },
              {
                id: 's-3',
                stage_key: 'COMPLETED',
                name: 'Completed',
                stage_type: 'COMPLETED',
                is_initial: false,
                is_terminal: true,
              },
            ],
            rndtechnosoft_onboarding_workflow_transitions: [
              { from_stage_id: 's-1', to_stage_id: 's-2' },
              { from_stage_id: 's-2', to_stage_id: 's-3' },
            ],
          },
        ],
      });

      const result = await service.validateWorkflow(mockTenantId, 'wf-1');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.stats.stageCount).toBe(3);
      expect(result.stats.transitionCount).toBe(2);
    });
  });

  describe('Candidate stage transitions', () => {
    it('returns candidate current stage and only valid next stages along transitions', async () => {
      prisma.rndtechnosoft_candidates.findFirst.mockResolvedValue({
        id: 'cand-1',
        full_name: 'John Doe',
        candidate_code: 'CND-001',
        candidate_status: 'SCREENING',
        current_stage_id: 's-2',
        current_stage: {
          id: 's-2',
          stage_key: 'SCREENING',
          name: 'Screening',
          stage_type: 'STANDARD',
          is_initial: false,
          is_terminal: false,
        },
        rndtechnosoft_onboarding_workflows: {
          id: 'wf-1',
          name: 'Standard Pipeline',
          workflow_code: 'std-pipeline',
        },
        rndtechnosoft_onboarding_workflow_versions: {
          id: 'ver-1',
          version_number: 1,
          rndtechnosoft_onboarding_workflow_stages: [
            { id: 's-1', stage_key: 'APPLICATION_RECEIVED', name: 'Start', stage_type: 'START' },
            { id: 's-2', stage_key: 'SCREENING', name: 'Screening', stage_type: 'STANDARD' },
            { id: 's-3', stage_key: 'INTERVIEW', name: 'Interview', stage_type: 'STANDARD' },
            { id: 's-4', stage_key: 'REJECTED', name: 'Rejected', stage_type: 'REJECTED', is_terminal: true },
          ],
          rndtechnosoft_onboarding_workflow_transitions: [
            { from_stage_id: 's-1', to_stage_id: 's-2', name: 'Begin' },
            { from_stage_id: 's-2', to_stage_id: 's-3', name: 'Pass Screening' },
            { from_stage_id: 's-2', to_stage_id: 's-4', name: 'Reject at Screening' },
          ],
        },
      });

      const options = await service.getCandidateStageOptions(mockTenantId, 'cand-1');

      expect(options.currentStage?.stageKey).toBe('SCREENING');
      expect(options.validNextStages).toHaveLength(2);
      expect(options.validNextStages.map((s) => s?.stageKey)).toEqual(['INTERVIEW', 'REJECTED']);
      expect(options.allStages.length).toBe(3); // All stages except current for override
    });
  });
});
