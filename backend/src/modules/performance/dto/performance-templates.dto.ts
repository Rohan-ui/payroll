import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { SCORING_METHODS } from '../scoring/scoring-methods';
import { EMPLOYEE_VISIBILITY, FIELD_TYPES, FILLED_BY, MAX_FIELDS } from '../scoring/form-fields';
import { MAX_KPIS_PER_KRA, MAX_KRAS, MISSING_RULES, SCORING_MODELS, TARGET_SOURCES, WEIGHT_RULES } from '../scoring/template-definition';

/** Numbers travel as strings so they are never rounded by binary floating point. */
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;
const PERCENT_MESSAGE = 'Enter a weight from 0 to 100, such as 40 or 12.5.';
const MARKS = /^\d{1,8}(\.\d{1,4})?$/;
const MARKS_MESSAGE = 'Enter marks such as 20 or 7.5 (up to 4 decimal places), not negative.';
const TARGET = /^-?\d{1,14}(\.\d{1,4})?$/;
const TARGET_MESSAGE = 'Enter a number such as 1000000 or 92.5 (up to 4 decimal places).';
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

export class TemplateScopesDto {
  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  departmentIds!: string[];

  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  designationIds!: string[];
}

export class TemplateSettingsDto {
  @IsString() @MinLength(1, { message: 'Give the template a name.' }) @MaxLength(160)
  templateName!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string | null;

  @IsBoolean()
  appliesToAll!: boolean;

  @ValidateNested() @Type(() => TemplateScopesDto)
  scopes!: TemplateScopesDto;
}

export class CreateTemplateDto extends TemplateSettingsDto {
  @Matches(CODE, { message: 'A code is 2 to 64 capital letters, digits or underscores, starting with a letter.' })
  templateCode!: string;
}

export class TemplateKpiDto {
  @IsUUID()
  kpiId!: string;

  @ValidateIf((_, v) => v !== null) @Matches(PERCENT, { message: PERCENT_MESSAGE })
  weightPercent!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(MARKS, { message: MARKS_MESSAGE })
  maxMarks!: string | null;

  @IsIn(SCORING_METHODS)
  scoringMethod!: (typeof SCORING_METHODS)[number];

  /** Checked in full by validateScoringConfig. */
  @IsObject()
  scoringConfig!: Record<string, unknown>;

  @IsIn(TARGET_SOURCES)
  targetSource!: (typeof TARGET_SOURCES)[number];

  @ValidateIf((_, v) => v !== null) @Matches(TARGET, { message: TARGET_MESSAGE })
  target!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(TARGET, { message: TARGET_MESSAGE })
  threshold!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(TARGET, { message: TARGET_MESSAGE })
  stretch!: string | null;

  @ValidateIf((_, v) => v !== null) @IsUUID()
  ratingScaleId!: string | null;

  @IsBoolean()
  allowsExemption!: boolean;
}

export class TemplateKraDto {
  @IsUUID()
  kraId!: string;

  @ValidateIf((_, v) => v !== null) @Matches(PERCENT, { message: PERCENT_MESSAGE })
  weightPercent!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(MARKS, { message: MARKS_MESSAGE })
  maxMarks!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(MARKS, { message: MARKS_MESSAGE })
  minMarks!: string | null;

  @ValidateIf((_, v) => v !== null) @IsIn(SCORING_METHODS)
  scoringMethod!: (typeof SCORING_METHODS)[number] | null;

  @ValidateIf((_, v) => v !== null) @IsUUID()
  ratingScaleId!: string | null;

  @IsBoolean()
  allowsExemption!: boolean;

  @IsArray() @ArrayMaxSize(MAX_KPIS_PER_KRA) @ValidateNested({ each: true }) @Type(() => TemplateKpiDto)
  kpis!: TemplateKpiDto[];
}

export class TemplateFieldDto {
  @IsString() @MaxLength(40)
  key!: string;

  @IsIn(FIELD_TYPES)
  type!: (typeof FIELD_TYPES)[number];

  @IsString() @MaxLength(200)
  label!: string;

  @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000)
  description!: string | null;

  @IsBoolean()
  required!: boolean;

  @IsIn(FILLED_BY)
  filledBy!: (typeof FILLED_BY)[number];

  @IsIn(EMPLOYEE_VISIBILITY)
  visibility!: (typeof EMPLOYEE_VISIBILITY)[number];

  /** Checked in full by validateFieldConfig. */
  @IsObject()
  config!: Record<string, unknown>;

  @ValidateIf((_, v) => v !== null) @IsUUID()
  ratingScaleId!: string | null;

  @IsBoolean()
  scored!: boolean;

  @ValidateIf((_, v) => v !== null) @Matches(PERCENT, { message: PERCENT_MESSAGE })
  weightPercent!: string | null;

  @ValidateIf((_, v) => v !== null) @Matches(MARKS, { message: MARKS_MESSAGE })
  maxMarks!: string | null;
}

/** A whole draft version. Saving checks shapes and references; publishing checks everything else. */
export class TemplateDraftDto {
  @IsIn(SCORING_MODELS)
  scoringModel!: (typeof SCORING_MODELS)[number];

  @IsIn(WEIGHT_RULES)
  weightRule!: (typeof WEIGHT_RULES)[number];

  @ValidateIf((_, v) => v !== null) @Matches(MARKS, { message: MARKS_MESSAGE })
  totalMarks!: string | null;

  @IsIn(MISSING_RULES)
  missingRatingRule!: (typeof MISSING_RULES)[number];

  @IsInt() @Min(0) @Max(4)
  scoreDecimals!: number;

  /** The rating scale whose final rating bands name the result; its latest published version is used. */
  @ValidateIf((_, v) => v !== null) @IsUUID()
  finalScaleId!: string | null;

  @IsArray() @ArrayMaxSize(MAX_KRAS) @ValidateNested({ each: true }) @Type(() => TemplateKraDto)
  kras!: TemplateKraDto[];

  @IsArray() @ArrayMaxSize(MAX_FIELDS) @ValidateNested({ each: true }) @Type(() => TemplateFieldDto)
  fields!: TemplateFieldDto[];

  @IsOptional() @IsString() @MaxLength(500)
  changeNote?: string;
}

/** What to try the scoring with, by line id; each value is checked by the scoring rules. */
export class TemplatePreviewDto {
  @IsObject()
  inputs!: Record<string, unknown>;
}
