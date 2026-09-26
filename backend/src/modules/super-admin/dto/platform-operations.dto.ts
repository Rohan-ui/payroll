import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PERMISSION_KEYS } from '@/common/access/access-catalog';
import { isFilled, PHONE_MESSAGE, PHONE_PATTERN, trim } from '@/modules/tenants/dto/organization-settings.dto';

const ROLE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const ROLE_CODE_MESSAGE = 'Role code: 2–64 capital letters, digits or underscores, starting with a letter (for example SALES_MANAGER).';
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));

export class SetModuleDto {
  @IsBoolean({ message: 'enabled must be true or false.' })
  enabled!: boolean;
}

/** The global account's own details. Membership and roles are changed per workspace. */
export class UpdatePlatformUserDto {
  @trim()
  @IsString()
  @MinLength(1, { message: 'Enter a name.' })
  @MaxLength(160)
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(320)
  email!: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;
}

export class AddMembershipDto {
  @IsUUID('4', { message: 'Choose a workspace.' })
  tenantId!: string;

  /** An active role of that workspace, or a role template it does not have yet. */
  @upper()
  @Matches(ROLE_CODE, { message: ROLE_CODE_MESSAGE })
  roleCode!: string;
}

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;

/** A role change, a suspension or reactivation, or both. Removal has its own route. */
export class UpdateMembershipDto {
  @IsOptional()
  @upper()
  @Matches(ROLE_CODE, { message: ROLE_CODE_MESSAGE })
  roleCode?: string;

  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES, { message: 'Membership status must be ACTIVE or SUSPENDED.' })
  status?: (typeof MEMBERSHIP_STATUSES)[number];
}

export class UpdateRoleTemplateDto {
  @trim()
  @IsString()
  @MinLength(2, { message: 'Template name must be at least 2 characters.' })
  @MaxLength(120)
  name!: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Granular permission keys from the catalog. */
  @IsArray()
  @ArrayUnique({ message: 'A permission is listed twice.' })
  @IsIn(PERMISSION_KEYS, { each: true, message: 'Unknown permission.' })
  permissions!: string[];
}

export class CreateRoleTemplateDto extends UpdateRoleTemplateDto {
  @upper()
  @Matches(ROLE_CODE, { message: ROLE_CODE_MESSAGE })
  code!: string;
}
