import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

export class GmailOAuthCallbackDto {
  @IsOptional()
  @IsIn(['https://accounts.google.com'])
  iss?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  error_description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  error_uri?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  error_subtype?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  authuser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  hd?: string;
}

export class GmailInboxQueryDto {
  @IsOptional()
  @IsIn(['inbox', 'sent'])
  folder: 'inbox' | 'sent' = 'inbox';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;
}

export class GmailMailboxQueryDto {
  @IsOptional()
  @IsIn(['inbox', 'sent'])
  folder: 'inbox' | 'sent' = 'inbox';
}

export class GmailSendMessageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(200_000)
  text!: string;
}

export class GmailReplyDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(200_000)
  text!: string;

  @IsOptional()
  @IsBoolean()
  replyAll = false;
}

export class GmailTemplatesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class GmailTemplateDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(80)
  category!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(300)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(200_000)
  body!: string;
}
