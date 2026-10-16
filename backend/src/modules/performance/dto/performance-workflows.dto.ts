import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import {
  AGGREGATIONS, ASSIGNMENT_MODES, COMPLETION_RULES, EMPLOYEE_SEES, ESCALATE_TO, LATER_STAGES_SEE, MAX_REMINDERS, MAX_STAGES, NOMINATORS, RATED_SCOPES,
  RESOLUTION_TIMINGS, RETURN_RULES, REVIEWER_IDENTITY, REVIEWER_SOURCES, STAGE_ACTIONS,
} from '../workflow/workflow-definition';
import { TemplateScopesDto } from './performance-templates.dto';

export class WorkflowSettingsDto {
  @IsString() @MinLength(1, { message: 'Give the workflow a name.' }) @MaxLength(160)
  workflowName!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string | null;

  @IsBoolean()
  appliesToAll!: boolean;

  /** Departments and designations it is for, the same way as a template's. */
  @ValidateNested() @Type(() => TemplateScopesDto)
  scopes!: TemplateScopesDto;
}

export class CreateWorkflowDto extends WorkflowSettingsDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, { message: 'A code is 2 to 64 capital letters, digits or underscores, starting with a letter.' })
  workflowCode!: string;
}

export class WorkflowStageDto {
  @IsString() @MaxLength(40)
  key!: string;

  @IsString() @MaxLength(120)
  name!: string;

  @IsInt() @Min(1) @Max(20)
  step!: number;

  @IsIn(REVIEWER_SOURCES)
  source!: (typeof REVIEWER_SOURCES)[number];

  @IsIn(ASSIGNMENT_MODES)
  mode!: (typeof ASSIGNMENT_MODES)[number];

  @IsIn(STAGE_ACTIONS)
  action!: (typeof STAGE_ACTIONS)[number];

  @IsInt() @Min(1) @Max(50)
  minReviewers!: number;

  @IsInt() @Min(1) @Max(50)
  maxReviewers!: number;

  @IsIn(COMPLETION_RULES)
  completion!: (typeof COMPLETION_RULES)[number];

  @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(50)
  minCompleted!: number | null;

  @IsIn(AGGREGATIONS)
  aggregation!: (typeof AGGREGATIONS)[number];

  @ValidateIf((_, v) => v !== null) @Matches(/^\d{1,3}(\.\d{1,4})?$/, { message: 'Enter a share from 0 to 100, such as 70 or 12.5.' })
  scoreWeightPercent!: string | null;

  @IsIn(RATED_SCOPES)
  ratedScope!: (typeof RATED_SCOPES)[number];

  @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('all', { each: true })
  kraIds!: string[];

  @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('all', { each: true })
  memberIds!: string[];

  @ValidateIf((_, v) => v !== null) @IsUUID()
  roleId!: string | null;

  @ValidateIf((_, v) => v !== null) @IsIn(NOMINATORS)
  nominatedBy!: (typeof NOMINATORS)[number] | null;

  @IsBoolean()
  nominationNeedsApproval!: boolean;

  @IsBoolean()
  allowsDecline!: boolean;

  @IsBoolean()
  allowsReplacement!: boolean;

  @IsIn(RETURN_RULES)
  returnRule!: (typeof RETURN_RULES)[number];

  @IsInt() @Min(1) @Max(365)
  dueDays!: number;

  @IsArray() @ArrayMaxSize(MAX_REMINDERS) @IsInt({ each: true }) @Min(1, { each: true }) @Max(364, { each: true })
  reminderDays!: number[];

  @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(90)
  escalateAfterDays!: number | null;

  @IsIn(ESCALATE_TO)
  escalateTo!: (typeof ESCALATE_TO)[number];

  @ValidateIf((_, v) => v !== null) @IsUUID()
  escalationRoleId!: string | null;

  @IsIn(EMPLOYEE_SEES)
  employeeSees!: (typeof EMPLOYEE_SEES)[number];

  @IsIn(REVIEWER_IDENTITY)
  identity!: (typeof REVIEWER_IDENTITY)[number];

  @IsIn(LATER_STAGES_SEE)
  laterStagesSee!: (typeof LATER_STAGES_SEE)[number];
}

/** A whole draft version. Saving checks shapes and references; publishing checks every rule. */
export class WorkflowDraftDto {
  @IsIn(RESOLUTION_TIMINGS)
  reviewerResolution!: (typeof RESOLUTION_TIMINGS)[number];

  @IsBoolean()
  allowsRepeatReviewers!: boolean;

  @IsArray() @ArrayMaxSize(MAX_STAGES) @ValidateNested({ each: true }) @Type(() => WorkflowStageDto)
  stages!: WorkflowStageDto[];

  @IsOptional() @IsString() @MaxLength(500)
  changeNote?: string;
}

export class ResolveReviewersDto {
  @IsUUID()
  employeeId!: string;

  @IsISO8601({ strict: true }, { message: 'Give the date to look the reviewers up on.' })
  onDate!: string;
}

export class MemberSearchQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;
}
