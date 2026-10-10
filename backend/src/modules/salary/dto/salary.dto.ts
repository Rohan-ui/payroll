import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { CALCULATION_TYPES, COMPONENT_CATEGORIES, ROUNDING_MODES } from '../formula/structure-engine';

/** Money and rates are sent as strings so they are never rounded by binary floating point. */
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const RATE = /^\d{1,14}(\.\d{1,4})?$/;
const MONEY_MESSAGE = 'Enter an amount such as 25000 or 25000.50, not negative.';
const RATE_MESSAGE = 'Enter a number such as 12.5 (up to 4 decimal places), not negative.';

export const SYSTEM_RULES = ['OVERTIME', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'LOAN_RECOVERY', 'ARREARS'] as const;
export const PAY_BASES = ['MONTHLY', 'DAILY', 'HOURLY'] as const;
export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH', 'CHEQUE'] as const;

export class ComponentSettingsDto {
  @IsString()
  @MinLength(1, { message: 'Give the component a name.' })
  @MaxLength(160)
  componentName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(COMPONENT_CATEGORIES)
  category!: (typeof COMPONENT_CATEGORIES)[number];

  @IsIn(CALCULATION_TYPES)
  calculationType!: (typeof CALCULATION_TYPES)[number];

  @ValidateIf((o: ComponentSettingsDto) => o.calculationType === 'SYSTEM_CALCULATED')
  @IsIn(SYSTEM_RULES, { message: 'Choose what payroll calculates this component from.' })
  systemRule?: (typeof SYSTEM_RULES)[number] | null;

  @IsBoolean() isStatutory!: boolean;
  @IsBoolean() isTaxable!: boolean;
  @IsBoolean() isProrated!: boolean;
  @IsBoolean() includeInGross!: boolean;
  @IsBoolean() includeInCtc!: boolean;
  @IsBoolean() showOnPayslip!: boolean;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY, { message: MONEY_MESSAGE })
  minAmount?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY, { message: MONEY_MESSAGE })
  maxAmount?: string | null;

  @Type(() => Number) @IsInt() @Min(0) @Max(4)
  roundingScale!: number;

  @IsIn(ROUNDING_MODES)
  roundingMode!: (typeof ROUNDING_MODES)[number];

  @Type(() => Number) @IsInt() @Min(0) @Max(9999)
  displayOrder!: number;
}

export class CreateComponentDto extends ComponentSettingsDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/, { message: 'A component code is 2 to 32 capital letters, digits or underscores, starting with a letter (it is used in formulas).' })
  componentCode!: string;
}

export class StructureLineDto {
  @IsUUID()
  salaryComponentId!: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY, { message: MONEY_MESSAGE })
  defaultAmount?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(RATE, { message: RATE_MESSAGE })
  defaultPercentage?: string | null;

  /** A component code in the same structure, or a system value such as MONTHLY_SALARY. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^[A-Z][A-Z0-9_]{1,31}$/, { message: 'Choose what this is a percentage of.' })
  percentageBase?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000)
  formula?: string | null;

  @IsBoolean()
  isMandatory!: boolean;
}

export class StructureDraftDto {
  @IsISO8601({ strict: true }, { message: 'Give the date this version takes effect.' })
  effectiveFrom!: string;

  @IsOptional() @IsString() @MaxLength(500)
  changeNote?: string;

  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => StructureLineDto)
  lines!: StructureLineDto[];
}

export class CreateStructureDto extends StructureDraftDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, { message: 'A structure code is 2 to 64 capital letters, digits or underscores, starting with a letter.' })
  structureCode!: string;

  @IsString() @MinLength(1, { message: 'Give the structure a name.' }) @MaxLength(160)
  structureName!: string;
}

export class RenameStructureDto {
  @IsString() @MinLength(1, { message: 'Give the structure a name.' }) @MaxLength(160)
  structureName!: string;
}

export class PreviewOverrideDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY, { message: MONEY_MESSAGE })
  amount?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(RATE, { message: RATE_MESSAGE })
  percentage?: string | null;
}

export class StructurePreviewDto {
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => StructureLineDto)
  lines!: StructureLineDto[];

  /** System values to try, by name; anything not given uses its sample. Checked in the service. */
  @IsOptional() @IsObject()
  variables?: Record<string, string>;

  /** Employee amounts or percentages to try, by component code. Checked in the service. */
  @IsOptional() @IsObject()
  overrides?: Record<string, { amount?: string | null; percentage?: string | null }>;

  /** Amounts for manual and system-calculated components, by code. Checked in the service. */
  @IsOptional() @IsObject()
  provided?: Record<string, string>;
}

export class ComponentValueDto {
  @IsUUID()
  salaryComponentId!: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY, { message: MONEY_MESSAGE })
  amount?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(RATE, { message: RATE_MESSAGE })
  percentage?: string | null;
}

export class SalaryRevisionDto {
  @IsUUID()
  salaryStructureId!: string;

  @IsISO8601({ strict: true }, { message: 'Give the date this salary takes effect.' })
  effectiveFrom!: string;

  @IsIn(PAY_BASES)
  payBasis!: (typeof PAY_BASES)[number];

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY, { message: MONEY_MESSAGE })
  monthlySalary?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(MONEY, { message: MONEY_MESSAGE })
  annualCtc?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(RATE, { message: RATE_MESSAGE })
  baseRate?: string | null;

  @Matches(/^[A-Z]{3}$/, { message: 'Use a three-letter currency code such as INR.' })
  currencyCode!: string;

  /** A policy to use instead of the one that would cover the employee. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID()
  payrollPolicyId?: string | null;

  @IsBoolean()
  isOvertimeEligible!: boolean;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: (typeof PAYMENT_METHODS)[number];

  @IsString() @MinLength(3, { message: 'Say why the salary is changing (for example “Annual increment 2026”).' }) @MaxLength(500)
  changeReason!: string;

  /** Pay the new salary as arrears from this date, for months whose payroll is already finalized. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true }, { message: 'Give the date arrears start from.' })
  arrearsFrom?: string | null;

  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => ComponentValueDto)
  componentValues!: ComponentValueDto[];
}

export class CancelRevisionDto {
  @IsString() @MinLength(3, { message: 'Say why this salary revision is being cancelled.' }) @MaxLength(500)
  reason!: string;
}
