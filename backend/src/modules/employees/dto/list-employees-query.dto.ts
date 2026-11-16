import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const EMPLOYEE_SORT_FIELDS = ['name', 'code', 'joiningDate', 'department', 'designation', 'status'] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export class ListEmployeesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  /** Name, employee ID, email or phone. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional() @IsUUID()
  departmentId?: string;

  @IsOptional() @IsUUID()
  designationId?: string;

  @IsOptional() @IsUUID()
  employmentTypeId?: string;

  /** Work location: the branch on the current employment. */
  @IsOptional() @IsUUID()
  branchId?: string;

  @IsOptional() @IsUUID()
  managerId?: string;

  @IsOptional()
  @Matches(/^[A-Z][A-Z_]{1,31}$/, { message: 'Status must be a status code such as ACTIVE.' })
  status?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Joined from must be a date (YYYY-MM-DD).' })
  joinedFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Joined to must be a date (YYYY-MM-DD).' })
  joinedTo?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_SORT_FIELDS)
  sortBy: EmployeeSortField = 'code';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
