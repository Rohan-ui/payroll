import { IsISO8601, IsUUID, Matches } from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class ReportMonthQuery {
  @Matches(MONTH, { message: 'Choose a month (YYYY-MM).' })
  month!: string;
}

export class ReportRangeQuery {
  @IsISO8601({ strict: true }, { message: 'Give the start as a date (YYYY-MM-DD).' })
  from!: string;

  @IsISO8601({ strict: true }, { message: 'Give the end as a date (YYYY-MM-DD).' })
  to!: string;
}

export class ReportPeriodQuery {
  @IsUUID('all', { message: 'Choose a payroll period.' })
  periodId!: string;
}
