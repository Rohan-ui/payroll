import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CadenceQueryDto {
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsIn(['ALL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'BRANCHED', 'CONVERTED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subIndustry?: string;

  @IsOptional()
  @IsIn(['ALL', 'WHATSAPP', 'EMAIL', 'LINKEDIN', 'PHONE'])
  channel?: string;

  @IsOptional()
  @IsIn(['ALL', 'ACTION_RADAR', 'ALL_ACTIVE', 'BRANCHED', 'COMPLETED', 'CONVERTED'])
  queue?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 50;
}
