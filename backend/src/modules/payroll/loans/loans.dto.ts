import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export class CreateLoanDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(['LOAN', 'ADVANCE'])
  loanType!: 'LOAN' | 'ADVANCE';

  @Matches(MONEY, { message: 'Enter the amount given, such as 50000.' })
  principal!: string;

  /** Recover over this many months… */
  @ValidateIf((o: CreateLoanDto) => !o.installmentAmount)
  @Type(() => Number) @IsInt({ message: 'Give the number of monthly instalments.' }) @Min(1) @Max(120)
  installments?: number;

  /** …or by this much a month (the last instalment takes what is left). */
  @ValidateIf((o: CreateLoanDto) => !o.installments)
  @Matches(MONEY, { message: 'Give the amount recovered each month.' })
  installmentAmount?: string;

  /** The first month recovered from pay (YYYY-MM). */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Choose the first month to recover from pay.' })
  firstMonth!: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class LoanReasonDto {
  @IsString() @MinLength(3, { message: 'Say why.' }) @MaxLength(500)
  reason!: string;
}
