import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required.' })
  @MaxLength(256)
  password!: string;

  /**
   * Optional preferred workspace. Honoured only when the user is an active
   * member of it; otherwise the request is refused rather than silently
   * falling back.
   */
  @IsOptional()
  @IsUUID('4', { message: 'Workspace identifier must be a UUID.' })
  tenantId?: string;
}

export class SwitchTenantDto {
  @IsUUID('4', { message: 'Workspace identifier must be a UUID.' })
  tenantId!: string;
}

export class ChangePasswordDto {
  /**
   * Required for a voluntary change. Not needed while the account must replace
   * a temporary password: that session was opened with it moments ago.
   */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  currentPassword?: string;

  @IsString()
  @MinLength(10, { message: 'New password must be at least 10 characters long.' })
  @MaxLength(256)
  newPassword!: string;
}

export class AddMembershipDto {
  @IsUUID('4', { message: 'User identifier must be a UUID.' })
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roleCode?: string;
}

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  tenantCode!: string;

  /**
   * The workspace address (kpmg for kpmg.voogyo.com). Optional: without it the
   * address is derived from the tenant code. Validated and checked for
   * uniqueness and reserved names on the server.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subdomain?: string;

  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(320)
  email!: string;

  /** Required: sign-in refuses accounts that have no password set. */
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long.' })
  @MaxLength(256)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  adminName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class SubdomainAvailabilityQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  subdomain!: string;
}
