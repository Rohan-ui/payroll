import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CadenceQueryDto {
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsIn(['ALL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'BRANCHED', 'CONVERTED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subIndustry?: string;

  @IsOptional()
  @IsIn(['ALL', 'WHATSAPP', 'EMAIL', 'LINKEDIN', 'PHONE'])
  channel?: string;

  @IsOptional()
  @IsIn(['ALL', 'ACTION_RADAR', 'ALL_ACTIVE', 'BRANCHED', 'COMPLETED', 'CONVERTED'])
  queue?: string;

  /** Only touchpoints due today, tomorrow, in the coming week or on dueDate (overdue ones included); ALL by default. */
  @IsOptional()
  @IsIn(['TODAY', 'TOMORROW', 'WEEK', 'DATE', 'ALL'])
  due?: 'TODAY' | 'TOMORROW' | 'WEEK' | 'DATE' | 'ALL';

  /** The date for due=DATE, in the workspace's dates (YYYY-MM-DD). */
  @ValidateIf((dto: CadenceQueryDto) => dto.due === 'DATE')
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Choose a valid date.' })
  dueDate?: string;

  /** Only leads assigned to the member asking. */
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: 'true' | 'false';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 50;
}
