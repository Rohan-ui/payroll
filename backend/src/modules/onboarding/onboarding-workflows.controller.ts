import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { OnboardingWorkflowBuilderService } from './onboarding-workflow-builder.service';
import { CandidatesService } from './candidates.service';
import {
  ChangeCandidateWorkflowStageDto,
  CreateWorkflowDto,
  OverrideCandidateWorkflowStageDto,
  PublishWorkflowDto,
  SaveWorkflowDraftDto,
  UpdateWorkflowDto,
} from './dto/workflow-builder.dto';

/**
 * Controller for the Onboarding Workflow Builder (n8n-inspired visual canvas,
 * versioning, stage nodes, connections and candidate stage transitions).
 */
@Controller('onboarding')
export class OnboardingWorkflowsController {
  constructor(
    private readonly workflows: OnboardingWorkflowBuilderService,
    private readonly candidates: CandidatesService,
  ) {}

  @Get('workflows')
  @RequirePermissions('onboarding.view')
  async listWorkflows(
    @CurrentTenant() tenantId: string,
    @Query('module') module?: string,
  ) {
    const list = await this.workflows.listWorkflows(tenantId, module);
    return { success: true, data: list };
  }

  @Post('workflows')
  @RequirePermissions('onboarding.candidates.manage')
  async createWorkflow(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateWorkflowDto,
  ) {
    const created = await this.workflows.createWorkflow(tenantId, body, actor);
    return {
      success: true,
      data: created,
      message: 'Onboarding workflow created successfully.',
    };
  }

  @Get('workflows/active')
  @RequirePermissions('onboarding.view')
  async getActiveWorkflow(@CurrentTenant() tenantId: string) {
    const active = await this.workflows.getActiveWorkflow(tenantId);
    return { success: true, data: active };
  }

  @Get('workflows/:id')
  @RequirePermissions('onboarding.view')
  async getWorkflow(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    const detail = await this.workflows.getWorkflow(tenantId, id);
    return { success: true, data: detail };
  }

  @Put('workflows/:id')
  @RequirePermissions('onboarding.candidates.manage')
  async updateWorkflow(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() body: UpdateWorkflowDto,
  ) {
    const updated = await this.workflows.updateWorkflow(tenantId, id, body, actor);
    return {
      success: true,
      data: updated,
      message: 'Workflow properties updated.',
    };
  }

  @Post('workflows/:id/duplicate')
  @RequirePermissions('onboarding.candidates.manage')
  async duplicateWorkflow(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
  ) {
    const duplicated = await this.workflows.duplicateWorkflow(tenantId, id, actor);
    return {
      success: true,
      data: duplicated,
      message: 'Workflow duplicated successfully.',
    };
  }

  @Delete('workflows/:id')
  @RequirePermissions('onboarding.candidates.manage')
  async deleteWorkflow(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
  ) {
    const result = await this.workflows.deleteWorkflow(tenantId, id, actor);
    return { success: true, data: result, message: result.message };
  }

  @Put('workflows/:id/draft')
  @RequirePermissions('onboarding.candidates.manage')
  async saveDraft(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() body: SaveWorkflowDraftDto,
  ) {
    const saved = await this.workflows.saveDraft(tenantId, id, body, actor);
    return {
      success: true,
      data: saved,
      message: 'Workflow canvas draft saved successfully.',
    };
  }

  @Get('workflows/:id/validate')
  @RequirePermissions('onboarding.view')
  async validateWorkflow(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    const validation = await this.workflows.validateWorkflow(tenantId, id);
    return { success: true, data: validation };
  }

  @Post('workflows/:id/publish')
  @RequirePermissions('onboarding.candidates.manage')
  async publishWorkflow(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() body: PublishWorkflowDto,
  ) {
    const published = await this.workflows.publishWorkflow(tenantId, id, body, actor);
    return {
      success: true,
      data: published,
      message: 'Workflow published successfully. New version is now active.',
    };
  }

  // ── Candidate Dynamic Workflow Stage Operations ─────────────

  @Get('candidates/:id/valid-stages')
  @RequirePermissions('onboarding.view')
  async getCandidateStageOptions(
    @CurrentTenant() tenantId: string,
    @Param('id') candidateId: string,
  ) {
    const options = await this.workflows.getCandidateStageOptions(tenantId, candidateId);
    return { success: true, data: options };
  }

  @Post('candidates/:id/stage')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.candidates.manage')
  async changeCandidateStage(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') candidateId: string,
    @Body() body: ChangeCandidateWorkflowStageDto,
  ) {
    const status = body.stageId || body.stageKey;
    if (!status) {
      return { success: false, message: 'Please specify the target stage.' };
    }
    const updated = await this.candidates.move(
      tenantId,
      candidateId,
      { status, notes: body.notes },
      actor,
    );
    return {
      success: true,
      data: updated,
      message: 'Candidate moved to new workflow stage.',
    };
  }

  @Post('candidates/:id/override-stage')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.candidates.override')
  async overrideCandidateStage(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') candidateId: string,
    @Body() body: OverrideCandidateWorkflowStageDto,
  ) {
    const status = body.stageId || body.stageKey;
    if (!status) {
      return { success: false, message: 'Please specify the target stage.' };
    }
    const updated = await this.candidates.override(
      tenantId,
      candidateId,
      { status, reason: body.reason },
      actor,
    );
    return {
      success: true,
      data: updated,
      message: 'Candidate stage administratively overridden.',
    };
  }
}
