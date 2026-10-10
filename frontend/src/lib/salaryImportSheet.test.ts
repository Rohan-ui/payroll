import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { readAmount, readDate, readSalaryWorkbooks } from './salaryImportSheet';

const book = (name: string, rows: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return wb;
};
const SALARIES = book('Employee Salary Structure', [
  ['Name', 'ID', 'Deleted', 'Salary Structure', 'Start Date', 'Annual Gross', 'Monthly Gross', 'Employee'],
  ['Aadesh  Bhadilkar', 'x1', '0', 'Staff', '01/10/2025', '300000.00', '25000.00', 'Aadesh  Bhadilkar'],
  ['Sahil Navinbhai Bhanushali', 'x2', '0', 'Staff', '01/02/2026', '276000.00', '23,000.00', 'Sahil Bhanushali'],
  ['Old Row', 'x3', '1', 'Staff', '01/02/2026', '1', '1', 'Old Row'],
  ['Bad Date', 'x4', '0', 'Staff', '31/02/2026', '1', '1', 'Bad Date'],
  ['Part Timer', 'x5', '0', 'HOURLY BASE', '07/11/2025', '1500', '125', 'Part Timer'],
]);
const STRUCTURES = book('Salary Structure', [
  ['Name', 'ID', 'Deleted', 'Active', 'Calculation Based On'],
  ['Staff', 's1', '0', '1', 'Month Basis'],
  ['HOURLY BASE', 's2', '0', '1', 'Hourly Base'],
]);

describe('salary export sheets', () => {
  it('reads dates as written in the export, and refuses impossible ones', () => {
    expect(readDate('01/10/2025')).toBe('2025-10-01');
    expect(readDate('2026-02-01')).toBe('2026-02-01');
    expect(readDate('31/02/2026')).toBeNull();
    expect(readDate('')).toBeNull();
  });

  it('keeps amounts as text without separators', () => {
    expect(readAmount('25,000.00')).toBe('25000.00');
    expect(readAmount('₹ 125')).toBe('125');
    expect(readAmount('-5')).toBeNull();
    expect(readAmount('abc')).toBeNull();
  });

  it('reads both exports, leaving out deleted rows and reporting unreadable ones', () => {
    const result = readSalaryWorkbooks([SALARIES, STRUCTURES]);
    expect(result.found).toEqual({ salaries: true, structures: true });
    expect(result.bases).toEqual({ Staff: 'MONTHLY', 'HOURLY BASE': 'HOURLY' });
    expect(result.rows).toEqual([
      { rowNumber: 2, employeeName: 'Aadesh Bhadilkar', structureName: 'Staff', startDate: '2025-10-01', amount: '25000.00' },
      { rowNumber: 3, employeeName: 'Sahil Navinbhai Bhanushali', altName: 'Sahil Bhanushali', structureName: 'Staff', startDate: '2026-02-01', amount: '23000.00' },
      { rowNumber: 6, employeeName: 'Part Timer', structureName: 'HOURLY BASE', startDate: '2025-11-07', amount: '125' },
    ]);
    expect(result.problems).toEqual(['Row 5 (Bad Date): the start date “31/02/2026” isn’t a date. It is left out.']);
  });

  it('says when a file is neither export', () => {
    expect(readSalaryWorkbooks([book('Other', [['A', 'B'], [1, 2]])]).found).toEqual({ salaries: false, structures: false });
  });
});
