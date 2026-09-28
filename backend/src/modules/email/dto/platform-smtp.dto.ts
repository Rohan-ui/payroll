import { IsEmail, IsIn, IsInt, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { isFilled, SMTP_PORTS, trim } from '@/modules/tenants/dto/organization-settings.dto';

export const SMTP_ENCRYPTIONS = ['TLS', 'SSL', 'NONE'] as const;
export type SmtpEncryption = (typeof SMTP_ENCRYPTIONS)[number];

/** The platform's outgoing mail server, configured in HQ → Global settings. */
export class PlatformSmtpSettingsDto {
  @trim()
  @Matches(/^[A-Za-z0-9.-]{3,253}$/, { message: 'Enter the SMTP server host name, for example smtp.zoho.in.' })
  host!: string;

  @IsInt()
  @IsIn(SMTP_PORTS, { message: 'SMTP port must be 25, 465, 587 or 2525.' })
  port!: number;

  /** TLS = STARTTLS upgrade (usually 587); SSL = TLS from the first byte (usually 465). */
  @IsIn(SMTP_ENCRYPTIONS, { message: 'Choose STARTTLS, SSL/TLS or none.' })
  encryption!: SmtpEncryption;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(320)
  username?: string;

  /** Write-only. Omit to keep the stored password. */
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(512)
  password?: string;

  @trim()
  @IsEmail({}, { message: 'Enter the address mail is sent from.' })
  @MaxLength(320)
  fromEmail!: string;

  @trim()
  @IsString()
  @MinLength(1, { message: 'Enter the sender name people see.' })
  @MaxLength(120)
  fromName!: string;

  @trim()
  @ValidateIf(isFilled)
  @IsEmail({}, { message: 'Enter a valid reply-to address.' })
  @MaxLength(320)
  replyToEmail?: string;
}

export class SmtpTestDto {
  @trim()
  @IsEmail({}, { message: 'Enter the address to send the test to.' })
  @MaxLength(320)
  recipient!: string;
}
