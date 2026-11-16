import { Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf,
} from 'class-validator';

export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] as const;
/** Statuses HR may set directly. EXITED comes only from completing an exit in Offboarding. */
export const SETTABLE_STATUSES = ['ACTIVE', 'ON_NOTICE', 'SUSPENDED', 'INACTIVE'] as const;

const PHONE = /^\+?[0-9 ()-]{6,24}$/;
const PHONE_MESSAGE = 'Enter a phone number of digits, spaces, brackets or hyphens, optionally starting with +.';

/**
 * Personal and contact details. A field left out is unchanged; a field sent as
 * null is cleared (only optional fields can be cleared).
 */
export class UpdatePersonalDto {
  @IsOptional() @IsString() @MinLength(1, { message: 'First name cannot be empty.' }) @MaxLength(100)
  firstName?: string;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(100)
  middleName?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(100)
  lastName?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(100)
  preferredName?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsISO8601({ strict: true }, { message: 'Date of birth must be a date (YYYY-MM-DD).' })
  dateOfBirth?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(GENDERS)
  genderCode?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(MARITAL_STATUSES)
  maritalStatus?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(BLOOD_GROUPS)
  bloodGroup?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(/^[A-Z]{2}$/, { message: 'Nationality must be a two-letter country code such as IN.' })
  nationalityCountryCode?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsEmail({}, { message: 'Enter a valid work email.' }) @MaxLength(320)
  workEmail?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsEmail({}, { message: 'Enter a valid personal email.' }) @MaxLength(320)
  personalEmail?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(PHONE, { message: PHONE_MESSAGE })
  workMobile?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(PHONE, { message: PHONE_MESSAGE })
  personalMobile?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(PHONE, { message: PHONE_MESSAGE })
  alternateMobile?: string | null;
}

export class SaveAddressDto {
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

  @Matches(/^[A-Z]{2}$/, { message: 'Country must be a two-letter country code such as IN.' })
  countryCode!: string;
}

export class SaveEmergencyContactDto {
  @IsString() @MinLength(1, { message: 'Name is required.' }) @MaxLength(160)
  contactName!: string;

  @IsOptional() @IsString() @MaxLength(64)
  relationship?: string;

  @Matches(PHONE, { message: PHONE_MESSAGE })
  mobileNumber!: string;

  @IsOptional() @Matches(PHONE, { message: PHONE_MESSAGE })
  alternateMobileNumber?: string;

  @IsOptional() @IsEmail({}, { message: 'Enter a valid email.' }) @MaxLength(320)
  email?: string;

  @IsOptional() @IsBoolean()
  isPrimary?: boolean;
}

/**
 * A change to the employee's job from a date: the current employment row ends
 * the day before and a new one starts, so earlier months keep what was true
 * then. A field left out carries over; null clears it.
 */
export class EmploymentChangeDto {
  @IsISO8601({ strict: true }, { message: 'Give the date the change takes effect (YYYY-MM-DD).' })
  effectiveFrom!: string;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  departmentId?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  designationId?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  branchId?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID()
  employmentTypeId?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsISO8601({ strict: true }, { message: 'Confirmation date must be a date (YYYY-MM-DD).' })
  confirmationDate?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsISO8601({ strict: true }, { message: 'Probation end date must be a date (YYYY-MM-DD).' })
  probationEndDate?: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(0) @Max(365)
  noticePeriodDays?: number | null;

  @IsString() @MinLength(3, { message: 'Say why the job changed (at least 3 characters).' }) @MaxLength(500)
  reason!: string;
}

export class ChangeStatusDto {
  @IsIn(SETTABLE_STATUSES, { message: `Status must be one of ${SETTABLE_STATUSES.join(', ')}. To record an exit, use Offboarding.` })
  status!: string;

  @IsString() @MinLength(3, { message: 'Say why the status changed (at least 3 characters).' }) @MaxLength(500)
  reason!: string;
}

export class ActivityQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 30;

  /** Show entries older than this one (the `next` value of the previous page). */
  @IsOptional() @IsISO8601()
  before?: string;
}

export class ReplaceBankAccountDto {
  @IsString() @MinLength(2) @MaxLength(160)
  accountHolderName!: string;

  @IsString() @MinLength(2) @MaxLength(160)
  bankName!: string;

  @IsOptional() @IsString() @MaxLength(160)
  branchName?: string;

  @Matches(/^[0-9]{6,18}$/, { message: 'Account number must be 6 to 18 digits.' })
  accountNumber!: string;

  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'Enter a valid IFSC code, such as HDFC0001234.' })
  bankCode!: string;

  @IsOptional() @IsIn(['SAVINGS', 'CURRENT', 'SALARY'])
  accountType?: string;

  @IsISO8601({ strict: true }, { message: 'Give the date payments start going to this account (YYYY-MM-DD).' })
  effectiveFrom!: string;
}
