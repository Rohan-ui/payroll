import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { MANUAL_COMPONENTS, SALARY_BASES } from '../settlement-calculation';

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const AMOUNT_MESSAGE = 'Give the amount in rupees, with at most two decimal places.';

export class ManualSettlementLineDto {
  @IsIn(Object.keys(MANUAL_COMPONENTS), { message: 'Choose what kind of amount this is.' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  label!: string;

  @Matches(AMOUNT, { message: AMOUNT_MESSAGE })
  amount!: string;

  @IsString()
  @MinLength(3, { message: 'Say why this amount is being added.' })
  @MaxLength(500)
  reason!: string;
}

export class AdjustSettlementLineDto {
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SettlementReasonDto {
  @IsString()
  @MinLength(3, { message: 'Give a reason.' })
  @MaxLength(1000)
  reason!: string;
}

export class SettlementReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SettlementPaymentDto {
  @IsISO8601({ strict: true }, { message: 'Give the payment date.' })
  paymentDate!: string;

  @IsIn(['BANK_TRANSFER', 'CHEQUE', 'CASH', 'RECOVERED'], { message: 'Choose how it was paid.' })
  mode!: 'BANK_TRANSFER' | 'CHEQUE' | 'CASH' | 'RECOVERED';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}

class DayDivisorRule {
  @IsIn(SALARY_BASES)
  basis!: (typeof SALARY_BASES)[number];

  @IsInt()
  @Min(1)
  @Max(31)
  dayDivisor!: number;
}

class LeaveEncashmentRule extends DayDivisorRule {
  @IsBoolean()
  enabled!: boolean;
}

class GratuityRule {
  @IsBoolean()
  enabled!: boolean;

  @IsInt() @Min(0) @Max(40)
  minimumYears!: number;

  @IsInt() @Min(0) @Max(12)
  roundUpMonths!: number;

  @IsInt() @Min(1) @Max(31)
  daysPerYear!: number;

  @IsInt() @Min(1) @Max(31)
  dayDivisor!: number;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^[A-Z][A-Z0-9_]{0,31}$/, { each: true, message: 'Use salary component codes, such as BASIC.' })
  componentCodes!: string[];

  @IsOptional()
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE })
  cap!: string | null;
}

export class SettlementPolicyDto {
  @IsOptional() @ValidateNested() @Type(() => LeaveEncashmentRule)
  leaveEncashment?: LeaveEncashmentRule;

  @IsOptional() @ValidateNested() @Type(() => DayDivisorRule)
  notice?: DayDivisorRule;

  @IsOptional() @ValidateNested() @Type(() => GratuityRule)
  gratuity?: GratuityRule;
}
