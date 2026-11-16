import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsNumberString, IsOptional, IsString, Matches, Max, MaxLength, Min,
  MinLength, ValidateIf, ValidateNested,
} from 'class-validator';

const PHONE = /^\+?[0-9 ()-]{6,24}$/;
const PHONE_MESSAGE = 'Enter a phone number of digits, spaces, brackets or hyphens, optionally starting with +.';
const DATE = { strict: true } as const;

export class SendCandidateFormDto {
  /** How to send the link; email when left out. */
  @IsOptional() @IsArray() @ArrayMaxSize(2) @IsIn(['EMAIL', 'WHATSAPP'], { each: true })
  channels?: ('EMAIL' | 'WHATSAPP')[];

  /** Shown at the top of the form, e.g. what more is needed when it is sent again. */
  @IsOptional() @IsString() @MaxLength(1000)
  message?: string;
}

export class FormAddressDto {
  @IsString() @MinLength(1, { message: 'Address line 1 is required.' }) @MaxLength(200)
  addressLine1!: string;

  @IsOptional() @IsString() @MaxLength(200)
  addressLine2?: string;

  @IsString() @MinLength(1, { message: 'City is required.' }) @MaxLength(120)
  city!: string;

  @IsOptional() @IsString() @MaxLength(120)
  stateRegion?: string;

  @IsOptional() @IsString() @MaxLength(24)
  postalCode?: string;

  @Matches(/^[A-Z]{2}$/, { message: 'Country must be a two-letter code such as IN.' })
  countryCode!: string;
}

export class FormEducationDto {
  @IsString() @MinLength(1, { message: 'Qualification is required.' }) @MaxLength(160)
  qualification!: string;

  @IsString() @MinLength(1, { message: 'Institution is required.' }) @MaxLength(200)
  institution!: string;

  @IsOptional() @IsString() @MaxLength(200)
  university?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100)
  passingYear?: number;

  @IsOptional() @IsString() @MaxLength(32)
  score?: string;
}

export class FormExperienceDto {
  @IsString() @MinLength(1, { message: 'Company is required.' }) @MaxLength(200)
  companyName!: string;

  @IsString() @MinLength(1, { message: 'Designation is required.' }) @MaxLength(160)
  designation!: string;

  @IsOptional() @IsISO8601(DATE)
  startDate?: string;

  @IsOptional() @IsISO8601(DATE)
  endDate?: string;

  @IsOptional() @IsBoolean()
  isCurrent?: boolean;

  /** Annual salary as text, kept exact. */
  @IsOptional() @IsNumberString({ no_symbols: false }, { message: 'Salary must be a number.' }) @MaxLength(16)
  lastSalary?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  responsibilities?: string;
}

export class FormReferenceDto {
  @IsString() @MinLength(1, { message: 'Reference name is required.' }) @MaxLength(160)
  name!: string;

  @IsOptional() @IsString() @MaxLength(120)
  relationship?: string;

  @IsOptional() @IsString() @MaxLength(200)
  companyName?: string;

  @IsOptional() @Matches(PHONE, { message: PHONE_MESSAGE })
  phone?: string;

  @IsOptional() @IsEmail() @MaxLength(320)
  email?: string;
}

/** Everything the candidate submits. The server replaces what they sent before, if anything. */
export class SubmitCandidateFormDto {
  @IsString() @MinLength(2, { message: 'Enter your full name.' }) @MaxLength(200)
  fullName!: string;

  @IsISO8601(DATE, { message: 'Enter your date of birth.' })
  dateOfBirth!: string;

  @IsOptional() @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])
  genderCode?: string;

  @Matches(PHONE, { message: PHONE_MESSAGE })
  phone!: string;

  @IsOptional() @Matches(PHONE, { message: PHONE_MESSAGE })
  alternatePhone?: string;

  @ValidateNested() @Type(() => FormAddressDto)
  currentAddress!: FormAddressDto;

  @IsOptional() @ValidateNested() @Type(() => FormAddressDto)
  permanentAddress?: FormAddressDto;

  @ValidateNested({ each: true }) @Type(() => FormEducationDto) @ArrayMaxSize(10)
  education!: FormEducationDto[];

  @ValidateNested({ each: true }) @Type(() => FormExperienceDto) @ArrayMaxSize(15)
  experience!: FormExperienceDto[];

  @IsOptional() @IsNumberString({ no_symbols: false }, { message: 'Total experience must be a number of years.' }) @MaxLength(5)
  totalExperienceYears?: string;

  @IsOptional() @IsNumberString({ no_symbols: false }, { message: 'Expected salary must be a number.' }) @MaxLength(16)
  expectedSalary?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365)
  noticePeriodDays?: number;

  @IsOptional() @IsISO8601(DATE)
  lastWorkingDate?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  skills?: string;

  @IsString() @MinLength(1, { message: 'Emergency contact name is required.' }) @MaxLength(160)
  emergencyContactName!: string;

  @IsOptional() @IsString() @MaxLength(64)
  emergencyContactRelationship?: string;

  @Matches(PHONE, { message: PHONE_MESSAGE })
  emergencyContactPhone!: string;

  @ValidateNested({ each: true }) @Type(() => FormReferenceDto) @ArrayMaxSize(5)
  references!: FormReferenceDto[];

  @IsOptional() @IsString() @MaxLength(2000)
  additionalInformation?: string;

  /** The candidate confirms the details are true. */
  @IsIn([true], { message: 'Confirm that the details are correct.' })
  confirmed!: boolean;
}

export class EligibilityDecisionDto {
  @IsIn(['ELIGIBLE', 'NOT_ELIGIBLE'])
  decision!: 'ELIGIBLE' | 'NOT_ELIGIBLE';

  /** Internal; never sent to the candidate. */
  @IsOptional() @IsString() @MaxLength(2000)
  remarks?: string;

  @ValidateIf((o: EligibilityDecisionDto) => o.decision === 'NOT_ELIGIBLE')
  @IsString() @MinLength(3, { message: 'Give the reason the candidate is not eligible.' }) @MaxLength(500)
  reason?: string;

  /** Send the candidate a polite email saying the application is not moving forward. */
  @IsOptional() @IsBoolean()
  notifyCandidate?: boolean;

  /** Also send the same news by WhatsApp. */
  @IsOptional() @IsBoolean()
  notifyWhatsApp?: boolean;
}

export class ApplyChecklistDto {
  @IsIn(['APPLICATION', 'JOINING'])
  stage!: 'APPLICATION' | 'JOINING';
}
