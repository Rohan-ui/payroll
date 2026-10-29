import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const STAGE_TYPES = [
  'START',
  'STANDARD',
  'APPROVAL',
  'WAITING',
  'COMPLETED',
  'REJECTED',
  'WITHDRAWN',
  'TRIGGER',
  'ACTION',
  'CONDITION',
  'DELAY',
  'NOTIFICATION',
  'TERMINAL',
] as const;

export type WorkflowStageType = (typeof STAGE_TYPES)[number];

export class CreateWorkflowDto {
  @IsString()
  @MinLength(2, { message: 'Workflow name must be at least 2 characters.' })
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/i, {
    message: 'Workflow code may only contain letters, numbers, hyphens, and underscores.',
  })
  workflowCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  triggerType?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  triggerType?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class WorkflowStageInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Z0-9_-]+$/i, {
    message: 'Stage key may only contain letters, numbers, hyphens, and underscores.',
  })
  stageKey!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsIn(STAGE_TYPES)
  stageType: WorkflowStageType = 'STANDARD';

  @IsOptional()
  @IsBoolean()
  isInitial?: boolean;

  @IsOptional()
  @IsBoolean()
  isTerminal?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  colorCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  iconName?: string;

  @IsOptional()
  @IsNumber()
  positionX?: number;

  @IsOptional()
  @IsNumber()
  positionY?: number;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsObject()
  stageConfig?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class WorkflowTransitionInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(64)
  fromStageKey!: string;

  @IsString()
  @MaxLength(64)
  toStageKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  conditionType?: string;

  @IsOptional()
  @IsObject()
  transitionConfig?: Record<string, any>;
}

export class SaveWorkflowDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;

  @IsOptional()
  @IsObject()
  canvasLayout?: Record<string, any>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStageInputDto)
  stages!: WorkflowStageInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTransitionInputDto)
  transitions!: WorkflowTransitionInputDto[];
}

export class PublishWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class ChangeCandidateWorkflowStageDto {
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class OverrideCandidateWorkflowStageDto {
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stageKey?: string;

  @IsString()
  @MinLength(10, { message: 'Explain the administrative override in at least 10 characters.' })
  @MaxLength(2000)
  reason!: string;
}

export class MigrateCandidateWorkflowDto {
  @IsUUID()
  workflowVersionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetStageKey?: string;
}
