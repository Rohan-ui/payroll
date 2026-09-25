import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsISO4217CurrencyCode,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsInt,
  IsDateString,
} from 'class-validator';
import { PageQueryDto } from './platform-directory.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** An optional text field: an empty string means "not set". */
const optionalText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value;

export class BrandingDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  platformName!: string;

  @IsOptional()
  @Transform(optionalText)
  @IsEmail({}, { message: 'Enter a valid support email.' })
  @MaxLength(320)
  supportEmail?: string;

  @IsOptional()
  @Transform(optionalText)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Website must be an https:// address.' })
  @MaxLength(300)
  websiteUrl?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsISO4217CurrencyCode({ message: 'Choose a valid currency.' })
  currency!: string;
}

/** The public website's copy and SEO fields. */
export class WebsiteSettingsDto {
  @IsOptional() @Transform(optionalText) @IsString() @MaxLength(200) hero_title?: string;
  @IsOptional() @Transform(optionalText) @IsString() @MaxLength(400) hero_subtitle?: string;
  @IsOptional() @Transform(optionalText) @IsEmail() @MaxLength(320) contact_email?: string;
  @IsOptional()
  @Transform(optionalText)
  @Matches(/^[+0-9 ()-]{6,32}$/, { message: 'Contact phone: digits, spaces, +, - and brackets only.' })
  contact_phone?: string;
  @IsOptional()
  @Transform(optionalText)
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Brand colour must be a hex colour such as #4663C4.' })
  brand_color?: string;
  @IsOptional() @Transform(optionalText) @IsString() @MaxLength(70) seo_meta_title?: string;
  @IsOptional() @Transform(optionalText) @IsString() @MaxLength(170) seo_meta_description?: string;
}

export class CreateCouponDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{3,32}$/, { message: 'Code: 3–32 letters, numbers, hyphens or underscores.' })
  couponCode!: string;

  @IsIn(['PERCENTAGE', 'FIXED'])
  discountType!: 'PERCENTAGE' | 'FIXED';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999)
  discountValue!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  validUntil?: string;
}

export class ActivityQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Z_]{1,64}$/)
  category?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class StatusPageQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Z_]{1,32}$/)
  status?: string;
}
