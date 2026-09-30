import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAIL_PROVIDERS, MAIL_SECURITY } from '../mail-providers';

const HOST = /^[A-Za-z0-9.-]{3,253}$/;
const HOST_MESSAGE = 'Enter the server host name, for example smtp.gmail.com.';
/** One line with no angle brackets: it goes into the From header. */
const DISPLAY_NAME = /^[^\r\n<>"]*$/;

/** A member's own mail account. Passwords are left out to keep the saved ones. */
export class UserMailAccountDto {
  @IsIn(MAIL_PROVIDERS)
  provider!: string;

  @Matches(HOST, { message: HOST_MESSAGE })
  smtpHost!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort!: number;

  @IsIn(MAIL_SECURITY, { message: 'Choose SSL/TLS or STARTTLS. Unencrypted connections are not allowed for personal accounts.' })
  smtpSecurity!: string;

  @IsString()
  @MinLength(1, { message: 'Enter the SMTP username, usually your full email address.' })
  @MaxLength(320)
  smtpUsername!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  smtpPassword?: string;

  @IsEmail({}, { message: 'Enter the email address you send from.' })
  @MaxLength(320)
  senderEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(DISPLAY_NAME, { message: 'The display name must be one line, without < > or quotation marks.' })
  senderName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid reply-to address, or leave it empty.' })
  @MaxLength(320)
  replyToEmail?: string;

  @IsBoolean()
  imapEnabled!: boolean;

  @IsOptional()
  @Matches(HOST, { message: 'Enter the IMAP host name, for example imap.gmail.com.' })
  imapHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort?: number;

  @IsOptional()
  @IsIn(MAIL_SECURITY, { message: 'Choose SSL/TLS or STARTTLS for IMAP.' })
  imapSecurity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  imapUsername?: string;

  /** True when IMAP signs in with the SMTP password (the usual case). */
  @IsOptional()
  @IsBoolean()
  imapUsesSmtpPassword?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  imapPassword?: string;
}

export class TestEmailDto {
  @IsEmail({}, { message: 'Enter the address to send the test email to.' })
  @MaxLength(320)
  recipient!: string;
}

export class EmailPolicyDto {
  /** ALLOWED: members may send from their own accounts. ORGANIZATION_ONLY: all mail uses the organization's account. */
  @IsIn(['ALLOWED', 'ORGANIZATION_ONLY'])
  personalAccounts!: 'ALLOWED' | 'ORGANIZATION_ONLY';
}
