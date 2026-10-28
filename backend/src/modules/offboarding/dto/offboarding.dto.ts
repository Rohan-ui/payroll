import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const SEPARATION_TYPES = ['RESIGNATION', 'TERMINATION', 'RETIREMENT', 'CONTRACT_END'] as const;
export const SEPARATION_STATUSES = ['PENDING_APPROVAL', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'] as const;
export const CLEARANCE_TEAMS = ['MANAGER', 'IT', 'ADMIN', 'FINANCE', 'HR'] as const;
export const CLEARANCE_STATUSES = ['PENDING', 'CLEARED', 'WAIVED'] as const;

export type SeparationType = (typeof SEPARATION_TYPES)[number];
export type SeparationStatus = (typeof SEPARATION_STATUSES)[number];
export type ClearanceTeam = (typeof CLEARANCE_TEAMS)[number];
export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

const DATE = { strict: true } as const;

export class ResignDto {
  @IsString() @MinLength(3, { message: 'Say why you are resigning.' }) @MaxLength(1000)
  reason!: string;

  @IsISO8601(DATE, { message: 'Give the last working day you are asking for.' })
  lastWorkingDate!: string;
}

export class WithdrawDto {
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class StartSeparationDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(SEPARATION_TYPES)
  type!: SeparationType;

  @IsString() @MinLength(3, { message: 'Give the reason for the exit.' }) @MaxLength(1000)
  reason!: string;

  @IsISO8601(DATE, { message: 'Give the day notice was given.' })
  noticeDate!: string;

  @IsISO8601(DATE, { message: 'Give the last working day.' })
  lastWorkingDate!: string;
}

export class LastWorkingDateDto {
  @IsISO8601(DATE, { message: 'Give the last working day.' })
  lastWorkingDate!: string;
}

export class ExitInterviewDto {
  @IsISO8601(DATE, { message: 'Give the day the exit interview was held.' })
  interviewDate!: string;

  @IsString() @MinLength(3, { message: 'Write down what was discussed.' }) @MaxLength(4000)
  notes!: string;

  @IsOptional() @IsBoolean()
  rehireEligible?: boolean;
}

export class ClearanceUpdateDto {
  @IsIn(CLEARANCE_STATUSES)
  status!: ClearanceStatus;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class ClearanceItemDto {
  @IsIn(CLEARANCE_TEAMS)
  team!: ClearanceTeam;

  @IsString() @MinLength(3, { message: 'Name the checklist item.' }) @MaxLength(200)
  title!: string;
}

export class CancelSeparationDto {
  @IsString() @MinLength(3, { message: 'Say why this exit is being cancelled.' }) @MaxLength(500)
  reason!: string;
}

export class ListSeparationsQueryDto {
  @IsOptional() @IsIn(SEPARATION_STATUSES)
  status?: SeparationStatus;

  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;
}

export class EmployeeSearchQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;
}
