import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

export const LEAD_IMPORT_DESTINATIONS = ['CLIENT_OUTREACH', 'SALES_PIPELINE'] as const;
export type LeadImportDestination = (typeof LEAD_IMPORT_DESTINATIONS)[number];

/** Rows one import may hold; a larger file is split by the person importing it. */
export const LEAD_IMPORT_MAX_ROWS = 1000;

/**
 * One spreadsheet row, already mapped to lead fields by the import screen. Every
 * value is the text the file held; the server checks and converts each one, and
 * a value too long for its column fails only its own row, so the limits here
 * only bound the request.
 */
export class LeadImportRowDto {
  /** The row's number in the spreadsheet, so results point at the right line. */
  @IsInt()
  @Min(1)
  rowNumber!: number;

  @IsOptional() @IsString() @MaxLength(1000) companyName?: string;
  @IsOptional() @IsString() @MaxLength(1000) firstName?: string;
  @IsOptional() @IsString() @MaxLength(1000) lastName?: string;
  @IsOptional() @IsString() @MaxLength(1000) email?: string;
  @IsOptional() @IsString() @MaxLength(1000) alternateEmail?: string;
  @IsOptional() @IsString() @MaxLength(1000) phone?: string;
  @IsOptional() @IsString() @MaxLength(1000) alternatePhone?: string;
  @IsOptional() @IsString() @MaxLength(1000) whatsappNumber?: string;
  @IsOptional() @IsString() @MaxLength(1000) designation?: string;
  @IsOptional() @IsString() @MaxLength(1000) industry?: string;
  @IsOptional() @IsString() @MaxLength(1000) subIndustry?: string;
  @IsOptional() @IsString() @MaxLength(1000) city?: string;
  @IsOptional() @IsString() @MaxLength(1000) state?: string;
  @IsOptional() @IsString() @MaxLength(1000) country?: string;
  @IsOptional() @IsString() @MaxLength(10000) address?: string;
  @IsOptional() @IsString() @MaxLength(1000) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(1000) websiteUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) websiteStatus?: string;
  @IsOptional() @IsString() @MaxLength(1000) linkedinUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) linkedinCompanyUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) leadSource?: string;
  @IsOptional() @IsString() @MaxLength(1000) assignedTo?: string;
  @IsOptional() @IsString() @MaxLength(1000) budgetAmount?: string;
  @IsOptional() @IsString() @MaxLength(10000) requirementBrief?: string;
  @IsOptional() @IsString() @MaxLength(10000) internalNotes?: string;
}

/** Imports spreadsheet rows into Client Outreach or a sales pipeline, chosen explicitly. */
export class ImportLeadsDto {
  @IsIn(LEAD_IMPORT_DESTINATIONS, { message: 'Choose where the leads go: Client Outreach or a sales pipeline.' })
  destination!: LeadImportDestination;

  /** Required for a sales import; for Client Outreach, left out to import into the 30-day SOP itself. */
  @ValidateIf((dto: ImportLeadsDto) => dto.destination === 'SALES_PIPELINE' || dto.pipelineId !== undefined)
  @IsUUID('all', { message: 'Choose the pipeline the leads go to.' })
  pipelineId?: string;

  /** The first stage of a sales pipeline; outreach leads start in their pipeline's first stage. */
  @ValidateIf((dto: ImportLeadsDto) => dto.destination === 'SALES_PIPELINE')
  @IsUUID('all', { message: 'Choose the stage the leads start in.' })
  stageId?: string;

  /** Checks every row and reports what would happen, saving nothing. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'The file has no rows to import.' })
  @ArrayMaxSize(LEAD_IMPORT_MAX_ROWS, { message: `Import at most ${LEAD_IMPORT_MAX_ROWS} rows at a time. Split the file and import each part.` })
  @ValidateNested({ each: true })
  @Type(() => LeadImportRowDto)
  rows!: LeadImportRowDto[];
}
