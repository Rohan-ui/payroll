import * as XLSX from 'xlsx';

/**
 * Reading the earlier system's salary exports: the “Employee Salary
 * Structure” sheet (who is on which structure, from when, at what monthly
 * gross) and, optionally, the “Salary Structure” sheet (whether each
 * structure is paid by the month or the hour). Only the browser reads the
 * file; the server checks every value again. Nothing is guessed: a row with
 * an unreadable date or amount is reported, not fixed.
 */

export type ImportBasis = 'MONTHLY' | 'HOURLY';

export interface SalarySheetRow {
  rowNumber: number;
  employeeName: string;
  altName?: string;
  structureName: string;
  startDate: string;
  amount: string;
}

export interface SalarySheetResult {
  rows: SalarySheetRow[];
  /** How each structure is paid, from the structure sheet. */
  bases: Record<string, ImportBasis>;
  problems: string[];
  /** Which of the two exports the files were. */
  found: { salaries: boolean; structures: boolean };
}

const SALARY_HEADERS = ['Name', 'Salary Structure', 'Start Date', 'Monthly Gross'];
const STRUCTURE_HEADERS = ['Name', 'Calculation Based On'];
const tidy = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** dd/mm/yyyy (the export's format) or yyyy-mm-dd as yyyy-mm-dd, or null. */
export function readDate(value: unknown): string | null {
  const text = tidy(value);
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [y, m, d] = dmy ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])] : ymd ? [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])] : [0, 0, 0];
  if (!y) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** An amount as written, without thousands separators: “25,000.00” → “25000.00”, or null. */
export function readAmount(value: unknown): string | null {
  const text = tidy(value).replace(/,/g, '').replace(/^₹\s*/, '');
  return /^\d{1,16}(\.\d{1,4})?$/.test(text) ? text : null;
}

const basisOf = (value: string): ImportBasis | null => {
  const text = value.toLowerCase();
  if (text.includes('hour')) return 'HOURLY';
  if (text.includes('month')) return 'MONTHLY';
  return null;
};

/** Reads every sheet of each workbook given, whichever export it is. */
export function readSalaryWorkbooks(books: XLSX.WorkBook[]): SalarySheetResult {
  const result: SalarySheetResult = { rows: [], bases: {}, problems: [], found: { salaries: false, structures: false } };
  for (const book of books) {
    for (const sheetName of book.SheetNames) {
      const table = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1, raw: false, defval: '' });
      const headers = (table[0] ?? []).map(tidy);
      const col = (name: string) => headers.indexOf(name);
      const deleted = col('Deleted');
      const live = (row: unknown[]) => deleted < 0 || tidy(row[deleted]) !== '1';

      if (STRUCTURE_HEADERS.every((h) => col(h) >= 0) && col('Salary Structure') < 0) {
        result.found.structures = true;
        table.slice(1).filter(live).forEach((row, i) => {
          const name = tidy(row[col('Name')]);
          if (!name) return;
          const basis = basisOf(tidy(row[col('Calculation Based On')]));
          if (basis) result.bases[name] = basis;
          else result.problems.push(`Structure sheet row ${i + 2}: “${tidy(row[col('Calculation Based On')])}” isn’t month or hour basis; choose it below.`);
        });
        continue;
      }
      if (!SALARY_HEADERS.every((h) => col(h) >= 0)) continue;
      result.found.salaries = true;
      table.slice(1).forEach((row, i) => {
        const rowNumber = i + 2;
        if (!live(row)) return;
        const employeeName = tidy(row[col('Name')]);
        if (!employeeName && !tidy(row[col('Salary Structure')])) return;
        const startDate = readDate(row[col('Start Date')]);
        const amount = readAmount(row[col('Monthly Gross')]);
        const structureName = tidy(row[col('Salary Structure')]);
        if (!employeeName || !structureName || !startDate || !amount) {
          result.problems.push(`Row ${rowNumber}${employeeName ? ` (${employeeName})` : ''}: ${!structureName ? 'no structure' : !startDate ? `the start date “${tidy(row[col('Start Date')])}” isn’t a date` : !amount ? `the amount “${tidy(row[col('Monthly Gross')])}” isn’t a number` : 'no name'}. It is left out.`);
          return;
        }
        const alt = col('Employee') >= 0 ? tidy(row[col('Employee')]) : '';
        result.rows.push({ rowNumber, employeeName, ...(alt && alt !== employeeName ? { altName: alt } : {}), structureName, startDate, amount });
      });
    }
  }
  return result;
}

export async function readSalaryFiles(files: File[]): Promise<SalarySheetResult> {
  const books = await Promise.all(files.map(async (file) => XLSX.read(await file.arrayBuffer(), { type: 'array' })));
  return readSalaryWorkbooks(books);
}
