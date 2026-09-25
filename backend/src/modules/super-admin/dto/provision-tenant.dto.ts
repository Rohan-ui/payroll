import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MODULES } from '@/common/access/access-catalog';
import {
  INDUSTRY_TYPES,
  isFilled,
  PHONE_MESSAGE,
  PHONE_PATTERN,
  trim,
} from '@/modules/tenants/dto/organization-settings.dto';

const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIALING'] as const;

/** A subscription to an existing plan, attached when the workspace is created. */
export class ProvisionSubscriptionDto {
  @trim()
  @IsString()
  @MaxLength(64)
  planCode!: string;

  @IsIn(SUBSCRIPTION_STATUSES, { message: 'Subscription status must be ACTIVE or TRIALING.' })
  status!: (typeof SUBSCRIPTION_STATUSES)[number];

  @Matches(DATE_ONLY, { message: 'Start date must be a date (YYYY-MM-DD).' })
  startsOn!: string;

  @ValidateIf(isFilled)
  @Matches(DATE_ONLY, { message: 'End date must be a date (YYYY-MM-DD).' })
  endsOn?: string;

  @ValidateIf(isFilled)
  @Matches(DATE_ONLY, { message: 'Trial end must be a date (YYYY-MM-DD).' })
  trialEndsOn?: string;
}

/**
 * A workspace's organization details, as the platform console sets them when
 * it creates the workspace and edits them later. They map to the workspace
 * and its organization profile (the same fields the workspace edits in its
 * own settings).
 */
export class TenantOrganizationDto {
  @trim()
  @IsString()
  @MinLength(2, { message: 'Organization name must be at least 2 characters.' })
  @MaxLength(200)
  organizationName!: string;

  @trim()
  @IsString()
  @MinLength(2, { message: 'Legal name must be at least 2 characters.' })
  @MaxLength(200)
  legalName!: string;

  @ValidateIf(isFilled)
  @IsIn(INDUSTRY_TYPES, { message: 'Choose an industry from the list.' })
  industry?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Enter a website starting with https://.' })
  @MaxLength(300)
  website?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(160)
  contactName?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsEmail({}, { message: 'Enter a valid organization email address.' })
  @MaxLength(320)
  contactEmail?: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  contactPhone?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(500)
  address?: string;

  @upper()
  @ValidateIf(isFilled)
  @Matches(/^[A-Z]{2}$/, { message: 'Country: a two-letter ISO code such as IN.' })
  countryCode?: string;

  @upper()
  @ValidateIf(isFilled)
  @Matches(/^[A-Z0-9]{5,20}$/, { message: 'Tax ID / GSTIN must be 5–20 letters and digits.' })
  taxId?: string;

  @trim()
  @IsTimeZone({ message: 'Choose a valid timezone.' })
  timezone!: string;

  @upper()
  @IsISO4217CurrencyCode({ message: 'Choose a valid currency.' })
  currency!: string;
}

/** Everything needed to onboard a customer workspace from the platform console. */
export class ProvisionTenantDto extends TenantOrganizationDto {
  /** From the provisioning form; a repeated submission returns the workspace already created. */
  @IsUUID('4', { message: 'The request is missing its idempotency key. Reload the page and try again.' })
  idempotencyKey!: string;

  @trim()
  @Matches(/^[A-Za-z0-9_-]{2,64}$/, { message: 'Tenant code: 2–64 letters, numbers, hyphens or underscores.' })
  tenantCode!: string;

  /** Workspace address; made from the tenant code when omitted. Checked on the server. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  subdomain?: string;

  // Owner: becomes the workspace administrator.
  @trim()
  @IsString()
  @MinLength(1, { message: "Enter the owner's first name." })
  @MaxLength(80)
  ownerFirstName!: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(80)
  ownerLastName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Enter the owner's email address." })
  @MaxLength(320)
  ownerEmail!: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  ownerPhone?: string;

  // Modules switched on from the start; the rest start off.
  @IsArray()
  @ArrayUnique()
  @IsIn(MODULES.map((m) => m.code), { each: true, message: 'Unknown module.' })
  modules!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisionSubscriptionDto)
  subscription?: ProvisionSubscriptionDto;
}

export class ProvisioningCheckQueryDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  tenantCode?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  subdomain?: string;
}

export class ChangeSubdomainDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  subdomain!: string;
}

/** Limits a workspace may use. Every field is optional; only those sent change. */
export class TenantQuotasDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  userSeatsLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  branchLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  storageLimitMb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  monthlyAiTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  monthlyWhatsappCredits?: number;
}
