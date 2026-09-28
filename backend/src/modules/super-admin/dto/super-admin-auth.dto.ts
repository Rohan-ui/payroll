import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SuperAdminLoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required.' })
  @MaxLength(256)
  password!: string;
}

export class SuperAdminChangePasswordDto {
  @IsString()
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'New password must be at least 12 characters long.' })
  @MaxLength(256)
  newPassword!: string;
}

export class SuperAdminMfaCodeDto {
  @IsString()
  @MinLength(6, { message: 'Enter the 6-digit code or a recovery code.' })
  @MaxLength(64)
  code!: string;
}

export class SuperAdminDisableMfaDto {
  @IsString()
  @MaxLength(256)
  password!: string;

  @IsString()
  @MinLength(6, { message: 'Enter the 6-digit code or a recovery code.' })
  @MaxLength(64)
  code!: string;
}
