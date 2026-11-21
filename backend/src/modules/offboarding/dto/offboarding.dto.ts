import { trim } from '@/modules/tenants/dto/organization-settings.dto';
import { Transform,Type,  } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength,  Matches, IsObject, ValidateIf, ValidateNested } from 'class-validator';

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

  /** Why the day differs from what was asked for or agreed before; kept in the exit's date history. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class NoticeDecisionDto {
  @IsIn(['RECOVER', 'WAIVE'], { message: 'Choose to recover or waive the notice shortfall.' })
  decision!: 'RECOVER' | 'WAIVE';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReassignReportsDto {
  @IsUUID('4', { message: 'Choose the new manager.' })
  managerEmployeeId!: string;

  /** Only these reports; all of them when left out. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  employeeIds?: string[];
}

export class ExitInterviewDto {
  @IsISO8601(DATE, { message: 'Give the day the exit interview was held.' })
  interviewDate!: string;

  /** Who held it; the person recording it when left out. */
  @IsOptional() @IsUUID('4', { message: 'Choose who held the interview.' })
  conductedByMemberId?: string;

  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,47}$/, { message: 'Choose the main reason for leaving.' })
  primaryReason!: string;

  @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,47}$/, { message: 'Choose a reason from the list.' })
  secondaryReason?: string;

  /** What the employee said. */
  @trim() @IsString() @MinLength(3, { message: 'Write down what the employee said.' }) @MaxLength(4000)
  employeeFeedback!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  workplaceRating?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  compensationRating?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  growthRating?: number;

  @IsOptional() @IsBoolean()
  rehireEligible?: boolean;

  @IsOptional() @trim() @IsString() @MaxLength(1000)
  rehireRemarks?: string;

  /** HR-only; needs offboarding.interview.confidential. Left out, the saved notes stay as they are. */
  @IsOptional() @trim() @IsString() @MaxLength(4000)
  confidentialNotes?: string;
}

export class ScheduleInterviewDto {
  /** Date and time with its offset, such as 2026-12-10T15:30:00+05:30. */
  // A date alone would be read as midnight UTC, the small hours in India: the time and its offset are required.
  @IsISO8601({ strict: true }, { message: 'Give the date and time of the interview.' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/, { message: 'Give the date and time of the interview, with its time zone.' })
  scheduledAt!: string;

  /** Who holds it; the person booking it when left out. */
  @IsOptional() @IsUUID('4', { message: 'Choose who holds the interview.' })
  interviewerMemberId?: string;

  /** A room or a meeting link. */
  @IsOptional() @trim() @IsString() @MaxLength(300)
  location?: string;
}

export class ManagerFeedbackDto {
  @trim() @IsString() @MinLength(3, { message: 'Write your feedback first.' }) @MaxLength(4000)
  feedback!: string;
}

export class ExitReasonDto {
  @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,47}$/)
  code?: string;

  @trim() @IsString() @MinLength(2, { message: 'Name the reason.' }) @MaxLength(80)
  label!: string;

  @IsBoolean()
  active!: boolean;
}

export class ExitReasonsDto {
  @IsArray() @ArrayMaxSize(40, { message: 'Up to 40 reasons.' })
  @ValidateNested({ each: true }) @Type(() => ExitReasonDto)
  reasons!: ExitReasonDto[];
}

export class ClearanceUpdateDto {
  @IsIn(CLEARANCE_STATUSES)
  status!: ClearanceStatus;

  /** Remarks on clearing it. */
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  /** Needed to waive it. */
  @IsOptional() @trim() @IsString() @MaxLength(500)
  waiverReason?: string;
}

export class ClearanceItemDto {
  @IsIn(CLEARANCE_TEAMS)
  team!: ClearanceTeam;

  @trim() @IsString() @MinLength(3, { message: 'Name the checklist item.' }) @MaxLength(200)
  title!: string;

  @IsOptional() @trim() @IsString() @MaxLength(1000)
  description?: string;

  /** Defaults to required: only required items hold back completing the exit. */
  @IsOptional() @IsBoolean()
  isRequired?: boolean;

  /** By the last working day when left out. */
  @IsOptional() @IsISO8601(DATE, { message: 'Give the due date as a date.' })
  dueDate?: string;

  /** Someone who can clear this team's items. */
  @IsOptional() @IsUUID('4', { message: 'Choose who has this item.' })
  assignedMemberId?: string;
}

/** Changes an item's details; null clears the due date or the person who has it. */
export class ClearanceDetailsDto {
  @IsOptional() @trim() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsBoolean()
  isRequired?: boolean;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601(DATE, { message: 'Give the due date as a date.' })
  dueDate?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('4', { message: 'Choose who has this item.' })
  assignedMemberId?: string | null;
}

/** An item every new exit gets, after the standard six. */
export class ChecklistTemplateItemDto {
  @IsIn(CLEARANCE_TEAMS)
  team!: ClearanceTeam;

  @trim() @IsString() @MinLength(3, { message: 'Name the checklist item.' }) @MaxLength(200)
  title!: string;

  @IsOptional() @trim() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsBoolean()
  isRequired?: boolean;
}

export class ChecklistTemplateDto {
  @IsArray() @ArrayMaxSize(20, { message: 'Up to 20 extra items.' })
  @ValidateNested({ each: true }) @Type(() => ChecklistTemplateItemDto)
  items!: ChecklistTemplateItemDto[];
}

export class ChecklistOwnersQueryDto {
  @IsIn(CLEARANCE_TEAMS)
  team!: ClearanceTeam;
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

export const COMMENT_KINDS = ['COMMENT', 'HANDOVER'] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export class TeamCommentDto {
  @IsIn(COMMENT_KINDS)
  kind!: CommentKind;

  @trim() @IsString() @MinLength(1, { message: 'Write the comment first.' }) @MaxLength(2000)
  body!: string;
}

/** A manager clears or reopens their own checklist items; waiving stays with HR. */
export class TeamChecklistUpdateDto {
  @IsIn(['PENDING', 'CLEARED'])
  status!: 'PENDING' | 'CLEARED';

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class NotificationSettingsDto {
  @IsOptional() @IsBoolean() RESIGNATION_SUBMITTED?: boolean;
  @IsOptional() @IsBoolean() RESIGNATION_ACCEPTED?: boolean;
  @IsOptional() @IsBoolean() RESIGNATION_WITHDRAWN?: boolean;
  @IsOptional() @IsBoolean() EXIT_STARTED?: boolean;
  @IsOptional() @IsBoolean() CHECKLIST_ASSIGNED?: boolean;
  @IsOptional() @IsBoolean() CHECKLIST_REMINDER?: boolean;
  @IsOptional() @IsBoolean() LAST_DAY_REMINDER?: boolean;
  @IsOptional() @IsBoolean() SETTLEMENT_PENDING_REVIEW?: boolean;
  @IsOptional() @IsBoolean() SETTLEMENT_APPROVED?: boolean;
  @IsOptional() @IsBoolean() SETTLEMENT_PAID?: boolean;
  @IsOptional() @IsBoolean() EXIT_COMPLETED?: boolean;
  @IsOptional() @IsBoolean() LETTER_ISSUED?: boolean;
  @IsOptional() @IsBoolean() INTERVIEW_SCHEDULED?: boolean;
  @IsOptional() @IsBoolean() INTERVIEW_CANCELLED?: boolean;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return isoDay(d); };

/** Reports filters. The range picks exits by their last working day: the last 12 months and the next 3 unless given. */
export class OffboardingReportQueryDto {
  @IsOptional() @IsISO8601(DATE, { message: 'Give the start of the range as a date.' })
  from: string = monthsAgo(11);

  @IsOptional() @IsISO8601(DATE, { message: 'Give the end of the range as a date.' })
  to: string = isoDay(new Date(Date.now() + 90 * 86_400_000));

  @IsOptional() @IsIn(['month', 'quarter', 'year'])
  groupBy: 'month' | 'quarter' | 'year' = 'month';

  @IsOptional() @IsUUID('4')
  departmentId?: string;

  @IsOptional() @IsUUID('4')
  locationId?: string;

  @IsOptional() @IsIn(SEPARATION_TYPES)
  type?: SeparationType;

  @IsOptional() @IsIn(SEPARATION_STATUSES)
  status?: SeparationStatus;

  @IsOptional() @IsUUID('4')
  managerId?: string;
}
