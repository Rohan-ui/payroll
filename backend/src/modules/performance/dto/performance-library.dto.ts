import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { CONVERSION_METHODS, INPUT_KINDS, MAX_BANDS, MAX_LEVELS } from '../rating-scale';

/** Numbers are sent as strings so they are never rounded by binary floating point. */
const VALUE = /^\d{1,8}(\.\d{1,4})?$/;
const VALUE_MESSAGE = 'Enter a number such as 5 or 2.5 (up to 4 decimal places), not negative.';
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;
const PERCENT_MESSAGE = 'Enter a percentage from 0 to 100, such as 40 or 12.5.';
const TARGET = /^\d{1,14}(\.\d{1,4})?$/;
const TARGET_MESSAGE = 'Enter a number such as 1000000 or 92.5 (up to 4 decimal places), not negative.';
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const CODE_MESSAGE = 'A code is 2 to 64 capital letters, digits or underscores, starting with a letter.';

export const EVIDENCE_REQUIREMENTS = ['NONE', 'OPTIONAL', 'REQUIRED'] as const;
export const MEASUREMENT_TYPES = ['NUMERIC', 'PERCENTAGE', 'CURRENCY', 'COUNT', 'DURATION', 'QUALITY_SCORE', 'MILESTONE', 'YES_NO', 'RATING', 'QUALITATIVE'] as const;
export const DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NOT_APPLICABLE'] as const;
export const LIBRARY_STATUSES = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;

export class LibraryListQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsIn(LIBRARY_STATUSES)
  status?: (typeof LIBRARY_STATUSES)[number];

  @IsOptional() @IsUUID()
  departmentId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class EmployeeSearchQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;
}

export class KraScopesDto {
  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  departmentIds!: string[];

  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  designationIds!: string[];

  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  employeeIds!: string[];
}

export class KraKpiLinkDto {
  @IsUUID()
  kpiId!: string;

  @ValidateIf((_, v) => v !== null) @Matches(PERCENT, { message: PERCENT_MESSAGE })
  defaultWeightPercent!: string | null;
}

export class KraSettingsDto {
  @IsString() @MinLength(1, { message: 'Give the KRA a name.' }) @MaxLength(160)
  kraName!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  measurementMethod?: string | null;

  @IsOptional() @IsString() @MaxLength(4000)
  evaluationInstructions?: string | null;

  @IsIn(EVIDENCE_REQUIREMENTS)
  evidenceRequirement!: (typeof EVIDENCE_REQUIREMENTS)[number];

  @ValidateIf((_, v) => v !== null) @Matches(PERCENT, { message: PERCENT_MESSAGE })
  defaultWeightPercent!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(VALUE, { message: VALUE_MESSAGE })
  defaultMaxMarks!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(VALUE, { message: VALUE_MESSAGE })
  defaultMinMarks!: string | null;

  @ValidateIf((_, v) => v !== null) @IsUUID()
  ratingScaleId!: string | null;

  @IsBoolean()
  appliesToAll!: boolean;

  @ValidateNested() @Type(() => KraScopesDto)
  scopes!: KraScopesDto;

  /** The KPIs this KRA suggests, in order. */
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => KraKpiLinkDto)
  kpis!: KraKpiLinkDto[];

  @IsISO8601({ strict: true }, { message: 'Give the date the KRA can be used from.' })
  effectiveFrom!: string;

  @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true }, { message: 'Give a valid last date, or leave it open.' })
  effectiveTo!: string | null;
}

export class CreateKraDto extends KraSettingsDto {
  @Matches(CODE, { message: CODE_MESSAGE })
  kraCode!: string;
}

export class UpdateKraDto extends KraSettingsDto {
  /** The revision the edit was made from; a newer one means someone else changed it first. */
  @IsInt() @Min(1)
  expectedRevision!: number;
}

export class DuplicateDto {
  @Matches(CODE, { message: CODE_MESSAGE })
  code!: string;

  @IsString() @MinLength(1, { message: 'Give the copy a name.' }) @MaxLength(160)
  name!: string;
}

export class KpiSettingsDto {
  @IsString() @MinLength(1, { message: 'Give the KPI a name.' }) @MaxLength(160)
  kpiName!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsIn(MEASUREMENT_TYPES)
  measurementType!: (typeof MEASUREMENT_TYPES)[number];

  @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(32)
  unitLabel!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(/^[A-Z]{3}$/, { message: 'Give a 3-letter currency code such as INR.' })
  currencyCode!: string | null;

  @IsIn(DIRECTIONS)
  direction!: (typeof DIRECTIONS)[number];

  @ValidateIf((_, v) => v !== null) @Matches(TARGET, { message: TARGET_MESSAGE })
  defaultTarget!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(TARGET, { message: TARGET_MESSAGE })
  minimumExpected!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(TARGET, { message: TARGET_MESSAGE })
  stretchTarget!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(VALUE, { message: VALUE_MESSAGE })
  defaultMaxMarks!: string | null;

  @ValidateIf((_, v) => v !== null) @IsUUID()
  ratingScaleId!: string | null;

  @IsIn(EVIDENCE_REQUIREMENTS)
  evidenceRequirement!: (typeof EVIDENCE_REQUIREMENTS)[number];

  @IsOptional() @IsString() @MaxLength(4000)
  evaluationInstructions?: string | null;
}

export class CreateKpiDto extends KpiSettingsDto {
  @Matches(CODE, { message: CODE_MESSAGE })
  kpiCode!: string;
}

export class UpdateKpiDto extends KpiSettingsDto {
  @IsInt() @Min(1)
  expectedRevision!: number;
}

export class ScaleLevelDto {
  @Matches(VALUE, { message: VALUE_MESSAGE })
  value!: string;

  @IsString() @MaxLength(120)
  label!: string;

  @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  description!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(PERCENT, { message: PERCENT_MESSAGE })
  scorePercent!: string | null;
}

export class ScaleBandDto {
  @IsString() @MaxLength(120)
  label!: string;

  @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  description!: string | null;

  @Matches(PERCENT, { message: PERCENT_MESSAGE })
  minPercent!: string;

  @Matches(PERCENT, { message: PERCENT_MESSAGE })
  maxPercent!: string;
}

/** Checked in full by validateScale. */
export class ScaleDraftDto {
  @IsIn(INPUT_KINDS)
  inputKind!: (typeof INPUT_KINDS)[number];

  @IsIn(CONVERSION_METHODS)
  conversionMethod!: (typeof CONVERSION_METHODS)[number];

  @ValidateIf((_, v) => v !== null) @Matches(VALUE, { message: VALUE_MESSAGE })
  minValue!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(VALUE, { message: VALUE_MESSAGE })
  maxValue!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(VALUE, { message: VALUE_MESSAGE })
  stepValue!: string | null;

  @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(32)
  unitLabel!: string | null;

  @IsArray() @ArrayMaxSize(MAX_LEVELS) @ValidateNested({ each: true }) @Type(() => ScaleLevelDto)
  levels!: ScaleLevelDto[];

  @IsArray() @ArrayMaxSize(MAX_BANDS) @ValidateNested({ each: true }) @Type(() => ScaleBandDto)
  bands!: ScaleBandDto[];

  @IsOptional() @IsString() @MaxLength(500)
  changeNote?: string;
}

export class CreateScaleDto {
  @Matches(CODE, { message: CODE_MESSAGE })
  scaleCode!: string;

  @IsString() @MinLength(1, { message: 'Give the scale a name.' }) @MaxLength(160)
  scaleName!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string | null;

  @ValidateNested() @Type(() => ScaleDraftDto)
  draft!: ScaleDraftDto;
}

export class UpdateScaleDto {
  @IsString() @MinLength(1, { message: 'Give the scale a name.' }) @MaxLength(160)
  scaleName!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string | null;
}

export class AppointHeadDto {
  @IsUUID()
  departmentId!: string;

  @IsUUID()
  employeeId!: string;

  @IsISO8601({ strict: true }, { message: 'Give the date the appointment starts.' })
  effectiveFrom!: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class EndHeadDto {
  @IsISO8601({ strict: true }, { message: 'Give the last day of the appointment.' })
  effectiveTo!: string;
}

export class CancelHeadDto {
  @IsString() @MinLength(3, { message: 'Say why the appointment is being cancelled.' }) @MaxLength(500)
  reason!: string;
}
