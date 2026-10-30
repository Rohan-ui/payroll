import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsObject,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TEMPLATE_KINDS } from '../document-templates';


// ── Templates ─────────────────────────────────────────────────

/** A page's margins, in whole millimetres: the letter text stays inside them. */
export class PageMarginsDto {
  @Type(() => Number)
  @IsInt({ message: 'Margins are in whole millimetres.' })
  @Min(0, { message: 'Margins are between 0 and 60 mm.' })
  @Max(60, { message: 'Margins are between 0 and 60 mm.' })
  top!: number;

  @Type(() => Number)
  @IsInt({ message: 'Margins are in whole millimetres.' })
  @Min(0, { message: 'Margins are between 0 and 60 mm.' })
  @Max(60, { message: 'Margins are between 0 and 60 mm.' })
  right!: number;

  @Type(() => Number)
  @IsInt({ message: 'Margins are in whole millimetres.' })
  @Min(0, { message: 'Margins are between 0 and 60 mm.' })
  @Max(60, { message: 'Margins are between 0 and 60 mm.' })
  bottom!: number;

  @Type(() => Number)
  @IsInt({ message: 'Margins are in whole millimetres.' })
  @Min(0, { message: 'Margins are between 0 and 60 mm.' })
  @Max(60, { message: 'Margins are between 0 and 60 mm.' })
  left!: number;
}

export class CreateTemplateDto {
  @IsIn(TEMPLATE_KINDS)
  kind!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  /** Plain-text letters (from before formatting): the heading and the text. Not sent with a document. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body?: string;

  /** The formatted letter (editor document JSON); checked and rebuilt by the server. */
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;

  /** Page layout. Left out when saving a draft: kept as it is. */
  @IsOptional()
  @IsUUID()
  letterheadId?: string | null;

  @IsOptional()
  @IsIn(['A4', 'LETTER'])
  pageSize?: 'A4' | 'LETTER';

  @IsOptional()
  @ValidateNested()
  @Type(() => PageMarginsDto)
  marginsMm?: PageMarginsDto;

  @IsOptional()
  @IsBoolean()
  showPageNumbers?: boolean;
}

export class TemplateDraftDto {
  /** Plain-text letters (from before formatting): the heading and the text. Not sent with a document. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body?: string;

  /** The formatted letter (editor document JSON); checked and rebuilt by the server. */
  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;

  /** Page layout. Left out when saving a draft: kept as it is. */
  @IsOptional()
  @IsUUID()
  letterheadId?: string | null;

  @IsOptional()
  @IsIn(['A4', 'LETTER'])
  pageSize?: 'A4' | 'LETTER';

  @IsOptional()
  @ValidateNested()
  @Type(() => PageMarginsDto)
  marginsMm?: PageMarginsDto;

  @IsOptional()
  @IsBoolean()
  showPageNumbers?: boolean;
}

export class TemplatePreviewDto extends TemplateDraftDto {
  @IsIn(TEMPLATE_KINDS)
  kind!: string;
}

// ── Letterheads and previews ──────────────────────────────────

/** Where an image sits on the letterhead: mm from the header (or footer) area's top-left corner. */
export class LetterheadBoxDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Positions are in millimetres, to one decimal place.' })
  @Min(0, { message: 'An image starts inside its area.' })
  @Max(250)
  x!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Positions are in millimetres, to one decimal place.' })
  @Min(0, { message: 'An image starts inside its area.' })
  @Max(100)
  y!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Sizes are in millimetres, to one decimal place.' })
  @Min(3, { message: 'An image is at least 3 mm wide.' })
  @Max(250)
  width!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Sizes are in millimetres, to one decimal place.' })
  @Min(3, { message: 'An image is at least 3 mm tall.' })
  @Max(100)
  height!: number;

  /** Fill the box exactly, changing the image's proportions; off by default. */
  @IsBoolean()
  stretch!: boolean;

  /** Degrees clockwise about the box's centre. Left out: upright. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Rotation is in degrees, to one decimal place.' })
  @Min(-360, { message: 'Rotation is between -360° and 360°.' })
  @Max(360, { message: 'Rotation is between -360° and 360°.' })
  rotation?: number;
}

export const LETTERHEAD_IMAGES = ['logo', 'header', 'footer'] as const;
export const MAX_LETTERHEAD_ELEMENTS = 60;

/**
 * A design element on every page, such as a watermark: a box in mm from the
 * page's top-left, turned clockwise about its centre, at an opacity from 0 to 1.
 * An IMAGE shows an image uploaded for this letterhead; a TEXT shows its text.
 */
export class LetterheadElementDto {
  @IsIn(['IMAGE', 'TEXT'])
  kind!: 'IMAGE' | 'TEXT';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Positions are in millimetres, to one decimal place.' })
  @Min(0, { message: 'An element starts on the page.' })
  @Max(215.9)
  x!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Positions are in millimetres, to one decimal place.' })
  @Min(0, { message: 'An element starts on the page.' })
  @Max(297)
  y!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Sizes are in millimetres, to one decimal place.' })
  @Min(3, { message: 'An element is at least 3 mm wide.' })
  @Max(215.9)
  width!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Sizes are in millimetres, to one decimal place.' })
  @Min(3, { message: 'An element is at least 3 mm tall.' })
  @Max(297)
  height!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Rotation is in degrees, to one decimal place.' })
  @Min(-360, { message: 'Rotation is between -360° and 360°.' })
  @Max(360, { message: 'Rotation is between -360° and 360°.' })
  rotation!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Opacity is between 0 and 1, to two decimal places.' })
  @Min(0, { message: 'Opacity is between 0 and 1.' })
  @Max(1, { message: 'Opacity is between 0 and 1.' })
  opacity!: number;

  /** Drawn in front of the letter text; otherwise behind it. */
  @IsBoolean()
  aboveText!: boolean;

  @IsBoolean()
  hidden!: boolean;

  @IsBoolean()
  locked!: boolean;

  @ValidateIf((e: LetterheadElementDto) => e.kind === 'IMAGE')
  @IsUUID('all', { message: 'Choose an image uploaded for this letterhead.' })
  imageId?: string;

  @ValidateIf((e: LetterheadElementDto) => e.kind === 'TEXT')
  @IsString()
  @Matches(/\S/, { message: 'Enter the watermark’s text.' })
  @MaxLength(200)
  text?: string;

  @ValidateIf((e: LetterheadElementDto) => e.kind === 'TEXT')
  @IsIn(['helvetica', 'times', 'courier'], { message: 'Choose one of the listed fonts; other fonts can’t be printed in the PDF.' })
  fontFamily?: 'helvetica' | 'times' | 'courier';

  @ValidateIf((e: LetterheadElementDto) => e.kind === 'TEXT')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Font sizes are in points, to one decimal place.' })
  @Min(6, { message: 'Font sizes are between 6 and 200 pt.' })
  @Max(200, { message: 'Font sizes are between 6 and 200 pt.' })
  fontSizePt?: number;

  @IsOptional()
  @IsBoolean()
  bold?: boolean;

  @IsOptional()
  @IsBoolean()
  italic?: boolean;

  @ValidateIf((e: LetterheadElementDto) => e.kind === 'TEXT')
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Colours are written as #RRGGBB.' })
  color?: string;

  @ValidateIf((e: LetterheadElementDto) => e.kind === 'TEXT')
  @IsIn(['left', 'center', 'right'])
  align?: 'left' | 'center' | 'right';
}

/** Distances from the page edges, in whole millimetres; 0 is the edge of the paper. */
export class LetterheadPlacementDto {
  @Type(() => Number)
  @IsInt({ message: 'Distances are in whole millimetres.' })
  @Min(0, { message: 'The header is between 0 and 60 mm from the top edge.' })
  @Max(60, { message: 'The header is between 0 and 60 mm from the top edge.' })
  headerOffsetMm!: number;

  @Type(() => Number)
  @IsInt({ message: 'Distances are in whole millimetres.' })
  @Min(0, { message: 'The footer is between 0 and 60 mm from the bottom edge.' })
  @Max(60, { message: 'The footer is between 0 and 60 mm from the bottom edge.' })
  footerOffsetMm!: number;

  @Type(() => Number)
  @IsInt({ message: 'Distances are in whole millimetres.' })
  @Min(0, { message: 'The letterhead is between 0 and 60 mm from the side edges.' })
  @Max(60, { message: 'The letterhead is between 0 and 60 mm from the side edges.' })
  sideOffsetMm!: number;
}

export class LetterheadInputDto {
  @IsString()
  @MinLength(1, { message: 'Enter a name for the letterhead.' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1, { message: 'Enter the company name.' })
  @MaxLength(200)
  companyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address, or leave it empty.' })
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  /** Registration details such as CIN, GSTIN or PAN, printed in the footer. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  registrationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerText?: string;

  @IsIn(['LEFT', 'CENTER', 'RIGHT'])
  logoPosition!: 'LEFT' | 'CENTER' | 'RIGHT';

  @Type(() => Number)
  @IsInt()
  @Min(15, { message: 'The header is between 15 and 70 mm tall.' })
  @Max(70, { message: 'The header is between 15 and 70 mm tall.' })
  headerHeightMm!: number;

  @Type(() => Number)
  @IsInt()
  @Min(8, { message: 'The footer is between 8 and 50 mm tall.' })
  @Max(50, { message: 'The footer is between 8 and 50 mm tall.' })
  footerHeightMm!: number;

  /** Where the header and footer sit, from the page edges; null: at each template's margins. Left out: unchanged. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LetterheadPlacementDto)
  placement?: LetterheadPlacementDto | null;

  /** The logo's box; null: placed automatically by logoPosition. Left out: unchanged. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LetterheadBoxDto)
  logoBox?: LetterheadBoxDto | null;

  /** The header artwork's box; null: fitted to the whole header. Left out: unchanged. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LetterheadBoxDto)
  headerArtBox?: LetterheadBoxDto | null;

  /** The footer artwork's box; null: fitted to the whole footer. Left out: unchanged. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LetterheadBoxDto)
  footerArtBox?: LetterheadBoxDto | null;

  @IsBoolean()
  isDefault!: boolean;

  /** Images kept but not printed. Left out: unchanged. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(LETTERHEAD_IMAGES, { each: true })
  hiddenImages?: ('logo' | 'header' | 'footer')[];

  /** Images that can't be moved, resized or turned in the editor until unlocked. Left out: unchanged. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(LETTERHEAD_IMAGES, { each: true })
  lockedImages?: ('logo' | 'header' | 'footer')[];

  /** Every page element, in paint order (first is drawn first). Left out: unchanged; given: replaces them all. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LETTERHEAD_ELEMENTS, { message: `A letterhead has at most ${MAX_LETTERHEAD_ELEMENTS} elements.` })
  @ValidateNested({ each: true })
  @Type(() => LetterheadElementDto)
  elements?: LetterheadElementDto[];
}

export class LetterheadPreviewDto extends LetterheadInputDto {
  /** A saved letterhead whose images the preview uses. */
  @IsOptional()
  @IsUUID()
  letterheadId?: string;
}

export const DOCUMENT_ASSET_CATEGORIES = ['COMPANY_LOGO', 'AUTHORIZED_SIGNATURE', 'STAMP_SEAL', 'OTHER'] as const;
export type DocumentAssetCategory = (typeof DOCUMENT_ASSET_CATEGORIES)[number];

export class CreateDocumentAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsIn(DOCUMENT_ASSET_CATEGORIES)
  category?: DocumentAssetCategory;
}

export class UpdateDocumentAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsIn(DOCUMENT_ASSET_CATEGORIES)
  category?: DocumentAssetCategory;
}

