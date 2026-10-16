import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class MemberSearchQueryDto {
  @IsOptional() @IsString() @MaxLength(120)
  search?: string;
}

export class SetManagerDto {
  @IsUUID()
  managerEmployeeId!: string;

  @IsISO8601({ strict: true }, { message: 'Give the date they start reporting to this manager.' })
  effectiveFrom!: string;

  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class EndManagerDto {
  @IsISO8601({ strict: true }, { message: 'Give the last day they report to this manager.' })
  effectiveTo!: string;
}

export class CancelManagerDto {
  @IsString() @MinLength(3, { message: 'Say why this reporting line is being cancelled.' }) @MaxLength(500)
  reason!: string;
}

export class LinkLoginDto {
  @IsUUID()
  tenantMemberId!: string;
}
