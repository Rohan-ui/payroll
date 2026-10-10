import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** One email of a sequence as the editor sends it; `id` for a step that already exists. */
export class SequenceStepDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1, { message: 'Give every email a name.' })
  @MaxLength(120)
  stepName!: string;

  @Type(() => Number)
  @IsInt({ message: 'Delays are whole days.' })
  @Min(0)
  @Max(365, { message: 'A delay is at most 365 days.' })
  delayAmount!: number;

  @IsIn(['WORKING_DAYS', 'CALENDAR_DAYS'])
  delayUnit!: 'WORKING_DAYS' | 'CALENDAR_DAYS';

  /** The library template the email started from; it is copied, never linked. */
  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  @IsString()
  @MinLength(1, { message: 'Every email needs a subject.' })
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MinLength(1, { message: 'Every email needs a body.' })
  @MaxLength(20000)
  body!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class SequenceInputDto {
  @IsString()
  @MinLength(1, { message: 'Enter a name for the sequence.' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(['ORGANIZATION', 'LEAD_OWNER'])
  senderMode!: 'ORGANIZATION' | 'LEAD_OWNER';

  /** 0 = Sunday … 6 = Saturday. */
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one day emails may go out.' })
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays!: number[];

  /** Minutes after midnight, workspace time. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  windowStart!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  windowEnd!: number;

  @IsBoolean()
  skipHolidays!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'The daily limit is between 1 and 2000.' })
  @Max(2000, { message: 'The daily limit is between 1 and 2000.' })
  dailyLimit!: number;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  stopStageIds!: string[];

  @IsArray()
  @ArrayMaxSize(20, { message: 'A sequence has at most 20 emails.' })
  @ValidateNested({ each: true })
  @Type(() => SequenceStepDto)
  steps!: SequenceStepDto[];
}

export class EnrollLeadsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one lead.' })
  @ArrayMaxSize(500, { message: 'Add at most 500 leads at a time.' })
  @ArrayUnique()
  @IsUUID('all', { each: true })
  leadIds!: string[];

  /** Ends the leads' Client Outreach so they can join; without it they are skipped. */
  @IsOptional()
  @IsBoolean()
  moveFromOutreach?: boolean;
}

export class StopEnrollmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Enroll the lead in Client Outreach once the sequence stops. */
  @IsOptional()
  @IsBoolean()
  moveToOutreach?: boolean;
}

export class SequenceRuleDto {
  @IsString()
  @MinLength(1, { message: 'Enter a name for the rule.' })
  @MaxLength(120)
  name!: string;

  @IsIn(['LEAD_CREATED', 'STAGE_ENTERED'])
  triggerKind!: 'LEAD_CREATED' | 'STAGE_ENTERED';

  @IsOptional()
  @IsUUID()
  pipelineId?: string | null;

  @IsOptional()
  @IsUUID()
  stageId?: string | null;

  @IsOptional()
  @IsUUID()
  sourceId?: string | null;

  /** { match: 'ALL' | 'ANY', conditions: [{ field, operator, value }] }, checked by the server. */
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;
}

export class PreviewEmailDto {
  @IsString()
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  /** A lead to fill the placeholders from; without one, sample values. */
  @IsOptional()
  @IsUUID()
  leadId?: string;
}

export class TestEmailDto {
  @IsUUID()
  stepId!: string;
}

export class SendsQueryDto {
  @IsOptional()
  @IsUUID()
  sequenceId?: string;

  @IsOptional()
  @IsIn(['SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'UNCERTAIN', 'CANCELLED', 'BOUNCED', 'ATTENTION', 'REPLIED'])
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class EnrollmentsQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'COMPLETED', 'STOPPED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ReportQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class SuppressionQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(320)
  search?: string;

  @IsOptional()
  @IsIn(['UNSUBSCRIBED', 'BOUNCED', 'MANUAL'])
  reason?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AddSuppressionsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Enter at least one email address.' })
  @ArrayMaxSize(500, { message: 'Add at most 500 addresses at a time.' })
  @IsString({ each: true })
  @MaxLength(320, { each: true })
  emails!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
