import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/**
 * Records, for the current touchpoint, that a member opened a lead's WhatsApp
 * chat or LinkedIn page, copied its LinkedIn message, (MARKED_SENT) confirms
 * having sent the message there, or (NOT_AVAILABLE) that the lead isn't on
 * LinkedIn or has no WhatsApp number, so the day doesn't wait for it. Only what happened is sent: the number or
 * address is the lead's, resolved by the server.
 */
export class OutreachChannelActionDto {
  @IsUUID('all', { message: 'Choose the lead.' })
  leadId!: string;

  @IsIn(['WHATSAPP', 'LINKEDIN'], { message: 'Choose WhatsApp or LinkedIn.' })
  channel!: 'WHATSAPP' | 'LINKEDIN';

  @IsIn(['OPENED', 'MESSAGE_COPIED', 'MARKED_SENT', 'NOT_AVAILABLE'], { message: 'Say whether the chat was opened, the message copied, the message sent, or the lead isn’t there.' })
  action!: 'OPENED' | 'MESSAGE_COPIED' | 'MARKED_SENT' | 'NOT_AVAILABLE';

  /** NOT_AVAILABLE: why, kept with the record (optional). */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'The reason must be 500 characters or fewer.' })
  reason?: string;

  /** MARKED_SENT: the message as sent, kept with the record. */
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'Write the message that was sent.' })
  @MaxLength(10000, { message: 'The message must be 10,000 characters or fewer.' })
  message?: string;

  /** MARKED_SENT: record it again although the touchpoint's message was already marked sent. */
  @IsOptional()
  @IsBoolean()
  resend?: boolean;

  /** MARKED_SENT: also mark the touchpoint complete. */
  @IsOptional()
  @IsBoolean()
  completeTouchpoint?: boolean;
}
