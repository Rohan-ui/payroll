import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CANDIDATE_STATUSES } from '../onboarding-workflow';
import { DOCUMENT_TYPES } from '../candidate-documents';

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const YEARS = /^\d{1,2}(\.\d)?$/;

/** A candidate's details. Status is not set here: it moves through the workflow. */
export class CandidateInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  appliedPosition!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  hiringSource?: string;

  @IsOptional()
  @Matches(MONEY, { message: 'Enter the expected salary as an amount with up to 2 decimals.' })
  expectedSalary?: string;

  @IsOptional()
  @Matches(YEARS, { message: 'Enter the experience in years, with up to 1 decimal.' })
  experienceYears?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Enter the expected joining date as YYYY-MM-DD.' })
  expectedJoiningDate?: string;

  @IsOptional()
  @IsUUID()
  recruiterMemberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class ListCandidatesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsIn(CANDIDATE_STATUSES)
  status?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  recruiterMemberId?: string;

  /** Joining dates from / to (YYYY-MM-DD), for "joining soon". */
  @IsOptional()
  @IsDateString({ strict: true })
  joiningFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  joiningTo?: string;

  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  archived: 'active' | 'archived' | 'all' = 'active';

  /** Only candidates with an uploaded document waiting to be verified. */
  @IsOptional()
  @IsIn(['to_verify'])
  documents?: 'to_verify';
}

export class MoveCandidateDto {
  @IsString()
  @MaxLength(64)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class OverrideCandidateStatusDto {
  @IsString()
  @MaxLength(64)
  status!: string;

  @IsString()
  @MinLength(10, { message: 'Explain the override in at least 10 characters.' })
  @MaxLength(2000)
  reason!: string;
}

export class CandidateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  note!: string;
}

export class ScheduleInterviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  roundName?: string;

  @IsIn(['IN_PERSON', 'PHONE', 'ONLINE'])
  interviewType!: 'IN_PERSON' | 'PHONE' | 'ONLINE';

  /** The start as an ISO 8601 date-time with its offset, e.g. 2026-10-05T10:30:00+05:30. */
  @IsISO8601({ strict: true }, { message: 'Enter the start as a date and time.' })
  startsAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(600)
  durationMinutes!: number;

  /** IANA time zone the interview is arranged in, e.g. Asia/Kolkata. */
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Enter the meeting link as an https:// address.' })
  @MaxLength(500)
  meetingLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one interviewer.' })
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  interviewerMemberIds!: string[];

  @IsOptional()
  @IsBoolean()
  notifyCandidate?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyInterviewers?: boolean;
}

export class RescheduleInterviewDto {
  @IsISO8601({ strict: true }, { message: 'Enter the start as a date and time.' })
  startsAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(600)
  durationMinutes!: number;

  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Enter the meeting link as an https:// address.' })
  @MaxLength(500)
  meetingLink?: string;

  @IsString()
  @MinLength(3, { message: 'Say why the interview is being rescheduled.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

export class CancelInterviewDto {
  @IsString()
  @MinLength(3, { message: 'Say why the interview is being cancelled.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

export class InterviewFeedbackDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsIn(['STRONG_YES', 'YES', 'NO', 'STRONG_NO'])
  recommendation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class InterviewDecisionDto {
  @IsIn(['ADVANCE', 'SELECT', 'REJECT'])
  decision!: 'ADVANCE' | 'SELECT' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class ListInterviewsQueryDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;

  @IsOptional()
  @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED'])
  status?: string;

  /** Only interviews the signed-in member is on. */
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: string;
}

export class DashboardQueryDto {
  /** The viewer's IANA time zone, for what "today" means. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

// ── Offers ────────────────────────────────────────────────────

export class OfferComponentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @Matches(MONEY, { message: 'Enter each amount per year with up to 2 decimals, without commas.' })
  annualAmount!: string;
}

export class OfferInputDto {
  @IsUUID()
  templateVersionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  jobTitle!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string;

  @IsOptional()
  @IsUUID()
  reportingManagerEmployeeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  workLocation?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one pay component.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OfferComponentDto)
  components!: OfferComponentDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24)
  probationMonths?: number;

  @IsDateString({ strict: true }, { message: 'Enter the joining date as YYYY-MM-DD.' })
  joiningDate!: string;

  @IsDateString({ strict: true }, { message: 'Enter the last day to accept as YYYY-MM-DD.' })
  expiresOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  specialTerms?: string;
}

export class SubmitOfferDto {
  /** Approvers in the order they approve. */
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one approver.' })
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  approverMemberIds!: string[];
}

export class OfferApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class WithdrawOfferDto {
  @IsString()
  @MinLength(3, { message: 'Say why the offer is being withdrawn.' })
  @MaxLength(2000)
  reason!: string;
}

export class ListOffersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'])
  status?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  awaitingMyApproval?: string;
}

// ── The candidate's response (public link) ────────────────────

export class AcceptOfferDto {
  /** The candidate types their name to confirm. It is recorded as typed, not as a verified signature. */
  @IsString()
  @MinLength(2, { message: 'Type your full name to accept.' })
  @MaxLength(200)
  typedName!: string;

  @IsIn([true], { message: 'Confirm that you accept the offer.' })
  confirm!: boolean;
}

export class DeclineOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

// ── Documents ─────────────────────────────────────────────────

export class DocumentRequestItemDto {
  @IsIn(DOCUMENT_TYPES)
  type!: string;

  /** The name the candidate sees; the type's name when left out. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsBoolean()
  isRequired!: boolean;
}

export class RequestDocumentsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one document.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DocumentRequestItemDto)
  items!: DocumentRequestItemDto[];
}

export class RejectDocumentDto {
  /** Shown to the candidate, so they know what to upload instead. */
  @IsString()
  @MinLength(3, { message: 'Say why the document is not accepted, so the candidate can fix it.' })
  @MaxLength(1000)
  reason!: string;
}

/** An offer's unsaved form, to preview its letter before saving. */
export class OfferPreviewDto extends OfferInputDto {
  @IsUUID()
  candidateId!: string;
}

// ── Candidate Generated & Letter Documents ─────────────────────

export class GenerateCandidateDocumentDto {
  @IsUUID()
  templateId!: string;

  @IsOptional()
  @IsUUID()
  templateVersionId?: string;

  @IsOptional()
  @IsObject()
  customValues?: Record<string, string>;
}

export class CandidateDocumentLayoutDto {
  @IsOptional()
  @IsUUID()
  letterheadId?: string | null;

  @IsOptional()
  @IsIn(['A4', 'LETTER'])
  pageSize?: 'A4' | 'LETTER';

  @IsOptional()
  @IsObject()
  marginsMm?: { top: number; right: number; bottom: number; left: number };

  @IsOptional()
  @IsBoolean()
  showPageNumbers?: boolean;
}

export class SaveCandidateDocumentDto {
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  templateVersionId?: string;

  @IsString()
  @MinLength(1, { message: 'Enter a document title.' })
  @MaxLength(200)
  documentTitle!: string;

  @IsString()
  @MaxLength(64)
  documentType!: string;

  @IsObject()
  document!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  documentStatus?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateDocumentLayoutDto)
  layout?: CandidateDocumentLayoutDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  changelogNote?: string;

  @IsOptional()
  @IsInt()
  expectedVersionNumber?: number;
}

export class UpdateCandidateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  documentTitle?: string;

  @IsObject()
  document!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  documentStatus?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateDocumentLayoutDto)
  layout?: CandidateDocumentLayoutDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  changelogNote?: string;

  @IsOptional()
  @IsInt()
  expectedVersionNumber?: number;
}

export const CANDIDATE_DOCUMENT_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SENT',
  'DELIVERED',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'WITHDRAWN',
] as const;

export class ChangeDocumentStatusDto {
  @IsOptional()
  @IsString()
  @IsIn(CANDIDATE_DOCUMENT_STATUSES as unknown as string[], {
    message: 'Invalid document status',
  })
  newStatus?: string;

  @IsOptional()
  @IsString()
  @IsIn(CANDIDATE_DOCUMENT_STATUSES as unknown as string[], {
    message: 'Invalid document status',
  })
  toStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  isOverride?: boolean;
}

export class RestoreDocumentVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class SendCandidateDocumentEmailDto {
  @IsOptional()
  @IsUUID('all')
  templateId?: string;

  @IsOptional()
  @IsUUID('all')
  emailTemplateId?: string;

  @IsOptional()
  @IsUUID('all')
  versionId?: string;

  @IsEmail({}, { message: 'Enter a valid recipient email address.' })
  @MaxLength(320)
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ccEmails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bccEmails?: string;

  @IsString()
  @MinLength(1, { message: 'Email subject is required.' })
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MinLength(1, { message: 'Email body is required.' })
  bodyHtml!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class UpdateDocumentTemplateEmailAssociationDto {
  @IsOptional()
  @IsUUID('all')
  emailTemplateId?: string | null;
}

export class CreateEmailTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  templateName!: string;

  @IsString()
  @MaxLength(80)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentKind?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  bodyText!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  templateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentKind?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ConvertToEmployeeDto {
  @IsString({ message: 'Employee ID / code is required' })
  @MinLength(1)
  @MaxLength(64)
  employeeCode!: string;

  @IsString({ message: 'First name is required' })
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid work email' })
  @MaxLength(320)
  workEmail?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid personal email' })
  @MaxLength(320)
  personalEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  workMobile?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Date of birth must be YYYY-MM-DD' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  genderCode?: string;

  @IsDateString({ strict: true }, { message: 'Joining date must be YYYY-MM-DD' })
  joiningDate!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  employmentStatus?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Probation end date must be YYYY-MM-DD' })
  probationEndDate?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Confirmation date must be YYYY-MM-DD' })
  confirmationDate?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Employment end date must be YYYY-MM-DD' })
  employmentEndDate?: string;

  @IsOptional()
  @IsUUID()
  reportingManagerEmployeeId?: string;

  // Address
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentAddressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  currentPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  currentCountryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  permanentAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  permanentAddressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  permanentCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  permanentState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  permanentPostalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  permanentCountryCode?: string;

  // Emergency contact
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  emergencyContactRelationship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emergencyContactPhone?: string;

  // Compensation / Payroll
  @IsOptional()
  @IsUUID()
  salaryStructureId?: string;

  @IsOptional()
  @Matches(/^\d{1,14}(\.\d{1,2})?$/, { message: 'Annual CTC must be a valid monetary amount' })
  annualCtc?: string;

  @IsOptional()
  @Matches(/^\d{1,14}(\.\d{1,2})?$/, { message: 'Monthly gross must be a valid monetary amount' })
  monthlyGrossTarget?: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Salary effective from must be YYYY-MM-DD' })
  salaryEffectiveFrom?: string;

  // Bank
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  branchName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ifsc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  accountHolderName?: string;

  // Statutory
  @IsOptional()
  @IsString()
  @MaxLength(32)
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  aadhaarLast4?: string;

  // COSEC
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cosecEmployeeId?: string;
}


