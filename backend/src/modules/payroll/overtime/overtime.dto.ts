import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class OvertimeDecisionDto {
  @IsUUID()
  employeeId!: string;

  @IsISO8601({ strict: true })
  date!: string;

  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  /** Minutes approved (up to those recorded); ignored for a rejection. Omitted means all recorded minutes. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1440)
  approvedMinutes?: number;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class OvertimeDecisionsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => OvertimeDecisionDto)
  decisions!: OvertimeDecisionDto[];
}
