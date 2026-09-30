import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export const LEAD_SORTS = ['created_at', 'updated_at', 'company_name', 'lead_name', 'stage'] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

/** The Lead Management table: filters, sort and page, all applied by the server. */
export class LeadManagementQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  /** A member id, or "unassigned". */
  @IsOptional()
  @Matches(/^(unassigned|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, { message: 'Choose an assignee from the list.' })
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  pipelineId?: string;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsIn(['OPEN', 'WON', 'LOST'])
  status?: 'OPEN' | 'WON' | 'LOST';

  @IsOptional()
  @IsIn(LEAD_SORTS)
  sort: LeadSort = 'created_at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc' = 'desc';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

/** Assigns leads to one member, or unassigns them (assigneeMemberId null). */
export class AssignLeadsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one lead.' })
  @ArrayMaxSize(500, { message: 'Assign at most 500 leads at a time.' })
  @ArrayUnique()
  @IsUUID('all', { each: true, message: 'One of the selected leads is not valid.' })
  leadIds!: string[];

  @ValidateIf((_o, value) => value !== null)
  @IsUUID('all', { message: 'Choose a team member to assign the leads to.' })
  assigneeMemberId!: string | null;
}
