import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const DOCUMENT_CATEGORIES = [
  'IDENTITY', 'ADDRESS_PROOF', 'EDUCATION', 'EXPERIENCE', 'PREVIOUS_EMPLOYMENT', 'OFFER_LETTER', 'APPOINTMENT_LETTER',
  'EMPLOYMENT_AGREEMENT', 'JOINING', 'BANK', 'TAX', 'OTHER',
] as const;

/** The details sent with a file (multipart fields, so every value arrives as text). */
export class UploadEmployeeDocumentDto {
  @IsIn(DOCUMENT_CATEGORIES, { message: 'Choose a document category.' })
  category!: (typeof DOCUMENT_CATEGORIES)[number];

  @IsString() @MinLength(1, { message: 'Give the document a title.' }) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsISO8601({ strict: true }, { message: 'Issue date must be a date (YYYY-MM-DD).' })
  issuedOn?: string;

  @IsOptional() @IsISO8601({ strict: true }, { message: 'Expiry date must be a date (YYYY-MM-DD).' })
  expiresOn?: string;
}

export class DocumentReasonDto {
  @IsString() @MinLength(3, { message: 'Give a reason (at least 3 characters).' }) @MaxLength(500)
  reason!: string;
}
