import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { trim } from '@/modules/tenants/dto/organization-settings.dto';

/** Types that can be changed from HQ. NS, SOA, SRV and CAA are shown but not edited here. */
export const EDITABLE_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT'] as const;
export type EditableRecordType = (typeof EDITABLE_RECORD_TYPES)[number];

/** '@', '*', or labels relative to the zone (underscores allowed for _dmarc and similar). */
export const RECORD_NAME_PATTERN = /^(@|\*|(\*\.)?[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?)*)$/;

/** GoDaddy's minimum TTL is 600 seconds. */
export const MIN_TTL = 600;
export const MAX_TTL = 604800;

export class DnsRecordValueDto {
  @trim()
  @IsString()
  @MaxLength(1024)
  data!: string;

  @IsInt()
  @Min(MIN_TTL, { message: `TTL must be at least ${MIN_TTL} seconds.` })
  @Max(MAX_TTL)
  ttl!: number;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(0)
  @Max(65535)
  priority?: number | null;
}

export class CreateDnsRecordDto extends DnsRecordValueDto {
  @IsIn(EDITABLE_RECORD_TYPES, { message: 'Records of this type are not managed from HQ.' })
  type!: EditableRecordType;

  @trim()
  @Matches(RECORD_NAME_PATTERN, { message: 'Name: @ for the domain itself, * for the wildcard, or a host name such as mail.' })
  @MaxLength(253)
  name!: string;
}

export class ReplaceDnsRecordsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Keep at least one value, or delete the record instead.' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DnsRecordValueDto)
  values!: DnsRecordValueDto[];
}

export class DnsRecordKeyDto {
  @IsIn(EDITABLE_RECORD_TYPES, { message: 'Records of this type are not managed from HQ.' })
  type!: EditableRecordType;

  @Matches(RECORD_NAME_PATTERN, { message: 'Invalid record name.' })
  @MaxLength(253)
  name!: string;
}
