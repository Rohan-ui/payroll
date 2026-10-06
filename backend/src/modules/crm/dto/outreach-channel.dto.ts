import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/**
 * Records, for the current touchpoint, that a member opened a lead's WhatsApp
 * chat or LinkedIn page, copied its LinkedIn message, or (MARKED_SENT) confirms
 * having sent the message there. Only what happened is sent: the number or
 * address is the lead's, resolved by the server.
 */
export class OutreachChannelActionDto {
  @IsUUID('all', { message: 'Choose the lead.' })
  leadId!: string;

  @IsIn(['WHATSAPP', 'LINKEDIN'], { message: 'Choose WhatsApp or LinkedIn.' })
  channel!: 'WHATSAPP' | 'LINKEDIN';

  @IsIn(['OPENED', 'MESSAGE_COPIED', 'MARKED_SENT'], { message: 'Say whether the chat was opened, the message copied, or the message sent.' })
  action!: 'OPENED' | 'MESSAGE_COPIED' | 'MARKED_SENT';

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
