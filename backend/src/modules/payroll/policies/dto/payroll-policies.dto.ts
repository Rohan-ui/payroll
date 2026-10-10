import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsISO8601, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePolicyDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, { message: 'A policy code is 2 to 64 capital letters, digits or underscores, starting with a letter.' })
  policyCode!: string;

  @IsString()
  @MinLength(1, { message: 'Give the policy a name.' })
  @MaxLength(160)
  policyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  /** The first version's start date (YYYY-MM-DD). */
  @IsISO8601({ strict: true }, { message: 'Give the date the policy starts.' })
  effectiveFrom!: string;
}

export class UpdatePolicyDto {
  @IsString()
  @MinLength(1, { message: 'Give the policy a name.' })
  @MaxLength(160)
  policyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsBoolean()
  isDefault!: boolean;
}

export class PolicyScopesDto {
  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  departmentIds!: string[];

  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  branchIds!: string[];

  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  employmentTypeIds!: string[];

  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsUUID('all', { each: true })
  designationIds!: string[];
}

export class PolicyDraftDto {
  @IsISO8601({ strict: true }, { message: 'Give the date these rules take effect.' })
  effectiveFrom!: string;

  /** Checked in full by validatePolicyConfig. */
  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}
