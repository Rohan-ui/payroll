import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const MONEY = /^\d{1,16}(\.\d{1,4})?$/;

/** A structure named in the sheet, and how its people are paid. */
export class ImportStructureDto {
  @IsString() @MinLength(1) @MaxLength(160)
  sourceName!: string;

  @IsIn(['MONTHLY', 'HOURLY'])
  basis!: 'MONTHLY' | 'HOURLY';
}

/** One row of the sheet as the browser read it. */
export class ImportRowDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  rowNumber!: number;

  @IsString() @MinLength(1, { message: 'A row has no employee name.' }) @MaxLength(200)
  employeeName!: string;

  /** The sheet's second name column, when it spells the name differently. */
  @IsOptional() @IsString() @MaxLength(200)
  altName?: string;

  @IsString() @MinLength(1) @MaxLength(160)
  structureName!: string;

  @IsISO8601({ strict: true }, { message: 'A row has a start date that is not a date.' })
  startDate!: string;

  /** The monthly salary, or the hourly rate for an hourly structure. */
  @Matches(MONEY, { message: 'A row has an amount that is not a number.' })
  amount!: string;
}

export class ImportPreviewDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ImportStructureDto)
  structures!: ImportStructureDto[];

  @IsArray() @ArrayMinSize(1, { message: 'The sheet has no rows to import.' }) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}

/** A row to import, with the employee the person chose for it. */
export class ImportCommitRowDto extends ImportRowDto {
  @IsUUID()
  employeeId!: string;
}

export class ImportCommitDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ImportStructureDto)
  structures!: ImportStructureDto[];

  @IsArray() @ArrayMinSize(1, { message: 'Choose at least one row to import.' }) @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => ImportCommitRowDto)
  rows!: ImportCommitRowDto[];
}
