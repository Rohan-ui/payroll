import { IsISO8601, IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CalculationMonthQuery {
  @Matches(MONTH, { message: 'Choose a month (YYYY-MM).' })
  month!: string;
}

export class StartMonthDto {
  /** The day pay goes out (YYYY-MM-DD), if known. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsISO8601({ strict: true }, { message: 'Give the payment date as a date.' })
  paymentDate?: string | null;
}

export class CalculationPreviewQuery extends CalculationMonthQuery {
  @IsUUID()
  employeeId!: string;
}

/** The first and last day of a YYYY-MM month. */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}
