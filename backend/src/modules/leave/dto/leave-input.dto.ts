import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{0,31}$/, { message: 'Use a short code of letters, digits and underscores, such as CL.' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsHalfDay?: boolean;
}

export class SubmitLeaveRequestDto {
  @IsUUID('4', { message: 'Choose the employee.' })
  employeeId!: string;

  @IsUUID('4', { message: 'Choose the leave type.' })
  leaveTypeId!: string;

  @IsISO8601({ strict: true }, { message: 'Give the first day of leave.' })
  startDate!: string;

  @IsISO8601({ strict: true }, { message: 'Give the last day of leave.' })
  endDate!: string;

  /** Whole or half days, as a decimal string or number; the service checks it is positive. */
  @Matches(/^\d{1,3}(\.5|\.0)?$/, { message: 'Give the number of days, in whole or half days.' })
  requestedDays!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
