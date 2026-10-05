import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const HISTORY_CHANNELS = ['EMAIL', 'WHATSAPP', 'LINKEDIN', 'PHONE'] as const;

/** Filters for CRM history: a lead's history, or the workspace's audit trail. */
export class CrmHistoryQueryDto {
  /** The member who performed the action. */
  @IsOptional()
  @IsUUID('all', { message: 'Choose a team member from the list.' })
  actorId?: string;

  /** One action, or several separated by commas (e.g. OUTREACH_EMAIL_SENT,OUTREACH_EMAIL_FAILED). */
  @IsOptional()
  @Matches(/^[A-Z_]{1,32}(,[A-Z_]{1,32}){0,20}$/, { message: 'Choose an action from the list.' })
  actionType?: string;

  @IsOptional()
  @IsIn(HISTORY_CHANNELS, { message: 'Choose a channel from the list.' })
  channel?: string;

  /** From this moment (ISO 8601), inclusive. */
  @IsOptional()
  @IsISO8601({}, { message: 'Choose a valid start date.' })
  from?: string;

  /** Before this moment (ISO 8601). */
  @IsOptional()
  @IsISO8601({}, { message: 'Choose a valid end date.' })
  to?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a lead from the list.' })
  leadId?: string;

  @IsOptional()
  @Matches(/^[A-Z_]{1,64}$/, { message: 'Choose a record type from the list.' })
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

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
