import { Transform } from 'class-transformer';
import {
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

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

const isFilled = (_: object, value: unknown) =>
  value !== undefined && value !== null && value !== '';

const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,23}$/;
const PHONE_MESSAGE = 'Enter a phone number with digits only, optionally starting with a country code such as +91.';

export class CreateTeamMemberDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(320)
  email!: string;

  @trim()
  @IsString()
  @MinLength(1, { message: 'First name is required.' })
  @MaxLength(80)
  first_name!: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(80)
  last_name?: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;

  /** Must be a role of the caller's own workspace; checked by the service. */
  @IsUUID('all', { message: 'Choose a role for the new member.' })
  role_id!: string;
}

export class UpdateTeamMemberDto {
  @trim()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'First name is required.' })
  @MaxLength(80)
  first_name?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(80)
  last_name?: string;

  @trim()
  @ValidateIf(isFilled)
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a role from this workspace.' })
  role_id?: string;

  /** Workspace access only; the person's account in other workspaces is unaffected. */
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateRoleDto {
  @trim()
  @IsString()
  @MinLength(2, { message: 'Role name must be at least 2 characters.' })
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @ValidateIf(isFilled)
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, {
    message: 'Role code must start with a letter and use only letters, digits and underscores, for example SALES_MANAGER.',
  })
  code?: string;

  @trim()
  @ValidateIf(isFilled)
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateRoleDto {
  @trim()
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Role name must be at least 2 characters.' })
  @MaxLength(120)
  name?: string;

  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class SetRolePermissionDto {
  @IsIn(PERMISSION_KEYS, { message: 'Unknown permission.' })
  permissionKey!: string;

  @IsBoolean()
  granted!: boolean;
}
