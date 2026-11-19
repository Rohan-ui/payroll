import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { trim } from '@/modules/tenants/dto/organization-settings.dto';

export const ASSET_CATEGORIES = ['LAPTOP', 'DESKTOP', 'MONITOR', 'MOBILE_PHONE', 'SIM_CARD', 'ID_CARD', 'ACCESS_CARD', 'KEYS', 'OTHER'] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetTeam = 'IT' | 'ADMIN';

/** IT looks after equipment; Admin after cards, keys and anything else. */
export const ASSET_TEAM: Record<AssetCategory, AssetTeam> = {
  LAPTOP: 'IT', DESKTOP: 'IT', MONITOR: 'IT', MOBILE_PHONE: 'IT', SIM_CARD: 'IT',
  ID_CARD: 'ADMIN', ACCESS_CARD: 'ADMIN', KEYS: 'ADMIN', OTHER: 'ADMIN',
};

const DATE = { strict: true } as const;
/** Rupees with up to two decimals, as text, so it never passes through a float. */
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

export class AssignAssetDto {
  @IsIn(ASSET_CATEGORIES, { message: 'Choose what kind of asset it is.' })
  category!: AssetCategory;

  @trim() @IsString() @MinLength(2, { message: 'Name the asset, for example “Dell Latitude 5440”.' }) @MaxLength(160)
  name!: string;

  @IsOptional() @trim() @IsString() @MaxLength(80)
  tag?: string;

  @IsISO8601(DATE, { message: 'Give the day it was handed over.' })
  assignedDate!: string;

  @IsOptional() @IsISO8601(DATE, { message: 'Give the return date as a date.' })
  returnDueDate?: string;

  @IsOptional() @trim() @IsString() @MaxLength(500)
  remarks?: string;
}

export class RecordAssetReturnDto {
  @IsIn(['RETURNED', 'LOST', 'WAIVED'])
  status!: 'RETURNED' | 'LOST' | 'WAIVED';

  /** The day it came back, or was reported lost. */
  @IsISO8601(DATE, { message: 'Give the date.' })
  returnDate!: string;

  @IsOptional() @IsIn(['GOOD', 'DAMAGED'])
  condition?: 'GOOD' | 'DAMAGED';

  /** For a lost or damaged asset: what the employee pays, in rupees. */
  @IsOptional() @Matches(AMOUNT, { message: 'Give the recovery as an amount in rupees.' })
  recoveryAmount?: string;

  @IsOptional() @trim() @IsString() @MaxLength(500)
  remarks?: string;
}

export class AssetReasonDto {
  @trim() @IsString() @MinLength(3, { message: 'Give the reason.' }) @MaxLength(500)
  reason!: string;
}
