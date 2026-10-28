import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateEmploymentTypeDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'Employment type name is required.' })
  @MinLength(1, { message: 'Employment type name is required.' })
  @MaxLength(120, { message: 'Employment type name cannot exceed 120 characters.' })
  name!: string;

  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Code cannot exceed 64 characters.' })
  code?: string;

  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters.' })
  description?: string;

  @trim()
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Status must be ACTIVE or INACTIVE.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateEmploymentTypeDto {
  @trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Employment type name cannot be empty.' })
  @MinLength(1, { message: 'Employment type name cannot be empty.' })
  @MaxLength(120, { message: 'Employment type name cannot exceed 120 characters.' })
  name?: string;

  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters.' })
  description?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Status must be ACTIVE or INACTIVE.' })
  status?: 'ACTIVE' | 'INACTIVE';
}

export class SetEmploymentTypeStatusDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'Status must be ACTIVE or INACTIVE.' })
  status!: 'ACTIVE' | 'INACTIVE';
}

export class ListEmploymentTypesQueryDto {
  @trim()
  @IsOptional()
  @IsString()
  search?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'ALL'], { message: 'Status filter must be ACTIVE, INACTIVE, or ALL.' })
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
}
