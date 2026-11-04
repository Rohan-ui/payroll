import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** An optional text field where an empty string means "clear the value". */
export const isFilled = (_: object, value: unknown) =>
  value !== undefined && value !== null && value !== '';

export const INDUSTRY_TYPES = [
  'DIGITAL_AGENCY',
  'IT_SERVICES',
  'CONSULTING',
  'ECOMMERCE',
  'HEALTHCARE',
  'REAL_ESTATE',
  'MANUFACTURING',
  'FINANCE',
  'OTHER',
] as const;

export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,23}$/;
export const PHONE_MESSAGE = 'Enter a phone number with digits only, optionally starting with a country code such as +91.';

/** Ports an outbound mail server listens on. Anything else is refused so the connection test cannot probe arbitrary services. */
export const SMTP_PORTS = [25, 465, 587, 2525] as const;

export class UpdateOrganizationProfileDto {
  @trim()
  @IsString()
  @MinLength(2, { message: 'Company name must be at least 2 characters.' })
  @MaxLength(200)
  company_name!: string;

  @ValidateIf(isFilled)
  @IsIn(INDUSTRY_TYPES, { message: 'Choose an industry from the list.' })
  industry_type?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsISO4217CurrencyCode({ message: 'Choose a valid currency.' })
  currency!: string;

  @trim()
  @IsTimeZone({ message: 'Choose a valid timezone.' })
  timezone!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @ValidateIf(isFilled)
  @Matches(/^[A-Z0-9]{5,20}$/, { message: 'Tax ID / GSTIN must be 5–20 letters and digits.' })
  tax_gstin?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Enter a website starting with https://.' })
  @MaxLength(300)
  website_url?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(160)
  primary_contact_name?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsEmail({}, { message: 'Enter a valid contact email address.' })
  @MaxLength(320)
  primary_contact_email?: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  primary_contact_phone?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(500)
  company_address?: string;
}

export class SaveSmtpSettingsDto {
  @trim()
  @Matches(/^[A-Za-z0-9.-]{3,253}$/, { message: 'Enter the SMTP server host name, for example smtp.gmail.com.' })
  host!: string;

  @IsInt()
  @IsIn(SMTP_PORTS, { message: 'SMTP port must be 25, 465, 587 or 2525.' })
  port!: number;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(254)
  username?: string;

  /** Replaces the stored password only when non-empty. */
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(256)
  password?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(120)
  senderName?: string;

  @trim()
  @IsEmail({}, { message: 'Enter a valid sender email address.' })
  @MaxLength(320)
  senderEmail!: string;

  @trim()
  @ValidateIf(isFilled)
  @IsEmail({}, { message: 'Enter a valid reply-to email address.' })
  @MaxLength(320)
  replyToEmail?: string;

  @IsIn(['TLS', 'SSL', 'NONE'])
  encryption!: 'TLS' | 'SSL' | 'NONE';

  @IsBoolean()
  isActive!: boolean;
}

/**
 * Without a password the saved configuration is tested and every other field
 * is ignored. With a password, the draft values in the request are tested.
 */
export class TestSmtpSettingsDto {
  @trim()
  @ValidateIf(isFilled)
  @Matches(/^[A-Za-z0-9.-]{3,253}$/, { message: 'Enter the SMTP server host name, for example smtp.gmail.com.' })
  host?: string;

  @IsOptional()
  @IsInt()
  @IsIn(SMTP_PORTS, { message: 'SMTP port must be 25, 465, 587 or 2525.' })
  port?: number;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(254)
  username?: string;

  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(256)
  password?: string;

  @IsOptional()
  @IsIn(['TLS', 'SSL', 'NONE'])
  encryption?: 'TLS' | 'SSL' | 'NONE';
}

export class SaveWhatsAppSettingsDto {
  @IsIn(['META_CLOUD_API', 'GUPSHUP', 'TWILIO', 'OTOMAT'])
  provider!: 'META_CLOUD_API' | 'GUPSHUP' | 'TWILIO' | 'OTOMAT';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(512)
  apiBaseUrl?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(256)
  vendorUid?: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(/^[0-9]{5,32}$/, { message: 'WhatsApp Business Account ID must contain digits only.' })
  wabaId?: string;

  @trim()
  @ValidateIf((o) => o.provider !== 'OTOMAT' || Boolean(o.phoneNumberId && String(o.phoneNumberId).trim() !== ''))
  @Matches(/^[0-9]{5,32}$/, { message: 'Phone Number ID must contain digits only.' })
  phoneNumberId?: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  senderPhoneNumber?: string;

  /** Replaces the stored token only when non-empty. */
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(1024)
  accessToken?: string;

  /** Replaces the stored verify token only when non-empty. */
  @ValidateIf(isFilled)
  @IsString()
  @MinLength(8, { message: 'Webhook verify token must be at least 8 characters.' })
  @MaxLength(128)
  webhookVerifyToken?: string;

  @IsBoolean()
  isActive!: boolean;
}

/** Same rule as SMTP: a saved token is only ever sent with the saved phone number ID or vendor UID. */
export class TestWhatsAppSettingsDto {
  @IsOptional()
  @IsIn(['META_CLOUD_API', 'GUPSHUP', 'TWILIO', 'OTOMAT'])
  provider?: 'META_CLOUD_API' | 'GUPSHUP' | 'TWILIO' | 'OTOMAT';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(512)
  apiBaseUrl?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(256)
  vendorUid?: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(/^[0-9]{5,32}$/, { message: 'Phone Number ID must contain digits only.' })
  phoneNumberId?: string;

  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(1024)
  accessToken?: string;
}

export class SetModuleStateDto {
  @IsBoolean()
  enabled!: boolean;
}
