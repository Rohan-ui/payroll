import { IsBoolean, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Switches the every-minute COSEC sync on or off for this workspace. */
export class CosecAutoSyncDto {
  @IsBoolean({ message: 'Say whether automatic sync is on.' })
  enabled!: boolean;
}

/** Refreshes one employee's month from COSEC (when their attendance is opened). */
export class CosecRefreshEmployeeDto {
  /** The employee's id, or Employee Code. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  employeeId!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Choose a month as YYYY-MM.' })
  month!: string;
}
