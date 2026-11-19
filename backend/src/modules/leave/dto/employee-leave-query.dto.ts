import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const LEAVE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export class EmployeeLeaveQueryDto {
  @IsOptional() @IsIn(LEAVE_REQUEST_STATUSES)
  status?: (typeof LEAVE_REQUEST_STATUSES)[number];

  @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;
}
