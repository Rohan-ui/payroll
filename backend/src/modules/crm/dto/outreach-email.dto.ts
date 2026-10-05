import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/**
 * A Client Outreach email for a lead's current touchpoint. Only the content is
 * the sender's to choose: the recipient is the lead's email and the sending
 * account is the organization's, both resolved by the server, so any other
 * property (a `from`, SMTP details, who performed it) is refused.
 */
export class SendOutreachEmailDto {
  @IsUUID('all', { message: 'Choose the lead to email.' })
  leadId!: string;

  @IsString()
  @Matches(/\S/, { message: 'Enter a subject.' })
  @MaxLength(300, { message: 'The subject must be 300 characters or fewer.' })
  subject!: string;

  @IsString()
  @Matches(/\S/, { message: 'Write the message.' })
  @MaxLength(20000, { message: 'The message must be 20,000 characters or fewer.' })
  body!: string;

  /** Send the touchpoint's email again although it was already sent. */
  @IsOptional()
  @IsBoolean()
  resend?: boolean;

  /** Also mark the touchpoint complete once the email is sent. */
  @IsOptional()
  @IsBoolean()
  completeTouchpoint?: boolean;
}
