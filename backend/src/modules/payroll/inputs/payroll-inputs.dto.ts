import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;

export class InputMonthQuery {
  @Matches(MONTH, { message: 'Choose a month (YYYY-MM).' })
  month!: string;
}

export class CreateInputDto {
  @Matches(MONTH, { message: 'Choose a month (YYYY-MM).' })
  month!: string;

  @IsUUID()
  employeeId!: string;

  @IsUUID()
  salaryComponentId!: string;

  @Matches(MONEY, { message: 'Enter an amount such as 5000 or 5000.50, more than zero.' })
  amount!: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class UpdateInputDto {
  @Matches(MONEY, { message: 'Enter an amount such as 5000 or 5000.50, more than zero.' })
  amount!: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class RejectInputDto {
  @IsString() @MinLength(3, { message: 'Say why the entry is rejected.' }) @MaxLength(500)
  reason!: string;
}
