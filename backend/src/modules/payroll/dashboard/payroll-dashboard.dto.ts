import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class DashboardQuery {
  @Matches(MONTH, { message: 'Choose a month (YYYY-MM).' })
  month!: string;
}

export class DashboardEmployeesQuery extends DashboardQuery {
  @IsOptional() @IsIn(['ALL', 'READY', 'EXCEPTION', 'FINALIZED'])
  status?: 'ALL' | 'READY' | 'EXCEPTION' | 'FINALIZED';

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}
