import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { TemplateScopesDto } from './performance-templates.dto';

export const CYCLE_KINDS = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'PROBATION', 'PROJECT', 'CUSTOM'] as const;
const DECIMAL = /^-?\d{1,14}(\.\d{1,4})?$/;
const DECIMAL_MESSAGE = 'Enter a number such as 1000000 or 92.5 (up to 4 decimal places).';

export class CycleSettingsDto {
  @IsString() @MinLength(1, { message: 'Give the cycle a name.' }) @MaxLength(160)
  cycleName!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string | null;

  @IsIn(CYCLE_KINDS)
  cycleKind!: (typeof CYCLE_KINDS)[number];

  @IsISO8601({ strict: true }, { message: 'Give the first day of the review period.' })
  periodStart!: string;

  @IsISO8601({ strict: true }, { message: 'Give the last day of the review period.' })
  periodEnd!: string;

  @IsBoolean()
  appliesToAll!: boolean;

  @ValidateNested() @Type(() => TemplateScopesDto)
  scopes!: TemplateScopesDto;

  @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true }, { message: 'Give a valid joining cut-off date, or leave it empty.' })
  joinedOnOrBefore!: string | null;

  @IsBoolean()
  allowsOverlap!: boolean;

  @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('all', { each: true })
  templateIds!: string[];

  @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID('all', { each: true })
  workflowIds!: string[];
}

export class CreateCycleDto extends CycleSettingsDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, { message: 'A code is 2 to 64 capital letters, digits or underscores, starting with a letter.' })
  cycleCode!: string;
}

/** A choice made for one employee in the launch preview, instead of the one worked out. */
export class LaunchChoiceDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  templateId!: string;

  @IsUUID()
  workflowId!: string;
}

export class LaunchDto {
  /** Must be true: launching starts appraisals for everyone listed. */
  @IsBoolean()
  confirm!: boolean;

  @IsArray() @ArrayMaxSize(2000) @ArrayUnique() @IsUUID('all', { each: true })
  excludeEmployeeIds!: string[];

  @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => LaunchChoiceDto)
  choices!: LaunchChoiceDto[];

  /** When adding people to a cycle already running: only these employees (otherwise everyone eligible not yet in it). */
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ArrayUnique() @IsUUID('all', { each: true })
  onlyEmployeeIds?: string[];
}

export class AppraisalListQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsIn(['IN_PROGRESS', 'REVIEWS_COMPLETE', 'CANCELLED', 'NEEDS_REVIEWERS'])
  status?: string;

  @IsOptional() @IsUUID()
  departmentId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class TargetDto {
  @IsUUID()
  templateKpiId!: string;

  @ValidateIf((_, v) => v !== null) @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  target!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  threshold!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  stretch!: string | null;
}

export class TargetsDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TargetDto)
  targets!: TargetDto[];
}

export class AssignReviewerDto {
  @IsUUID()
  tenantMemberId!: string;

  /** An assigned reviewer this one replaces; kept in the history as replaced. */
  @ValidateIf((_, v) => v !== null) @IsUUID()
  replacesAssignmentId!: string | null;

  @IsString() @MinLength(3, { message: 'Say why this reviewer is assigned.' }) @MaxLength(500)
  reason!: string;
}

export class ReasonDto {
  @IsString() @MinLength(3, { message: 'Give a reason.' }) @MaxLength(500)
  reason!: string;
}

export class ColleagueQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;
}

export class NominateDto {
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true })
  tenantMemberIds!: string[];
}

export class DecideNominationDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

/** One answer in a review. Only the values its line takes are kept. */
export class ReviewItemDto {
  @IsUUID()
  lineId!: string;

  @IsIn(['KRA', 'KPI', 'FIELD'])
  kind!: 'KRA' | 'KPI' | 'FIELD';

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  actual?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  rating?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  marks?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^\d{1,3}(\.\d{1,4})?$/, { message: 'A score is a percentage from 0 to 100.' })
  scorePercent?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsBoolean()
  yesNo?: boolean | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  number?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(10000)
  text?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(120, { each: true })
  options?: string[];

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true })
  date?: string | null;

  @IsOptional() @IsBoolean()
  exempt?: boolean;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000)
  justification?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(4000)
  comment?: string | null;
}

export class SaveReviewDto {
  @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(10000)
  overallComment!: string | null;

  @IsArray() @ArrayMaxSize(400) @ValidateNested({ each: true }) @Type(() => ReviewItemDto)
  items!: ReviewItemDto[];
}

export class SendBackDto {
  @IsString() @MaxLength(40)
  toStageKey!: string;

  @IsString() @MinLength(3, { message: 'Say what needs correcting.' }) @MaxLength(500)
  reason!: string;
}

export class EvidenceQueryDto {
  @IsOptional() @IsUUID()
  lineId?: string;

  @IsOptional() @IsIn(['KRA', 'KPI', 'FIELD'])
  kind?: 'KRA' | 'KPI' | 'FIELD';
}
