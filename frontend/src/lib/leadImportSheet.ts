import * as XLSX from 'xlsx';

/**
 * Reading lead spreadsheets for import: every sheet of the workbook, the row
 * that holds the headers, which column becomes which lead field, and the rows
 * sent to the server. Nothing here invents a value: an empty cell stays empty,
 * and a column with no lead field is either kept in the lead's notes or, when
 * the person chooses, left out.
 */

export type LeadField =
  | 'companyName' | 'firstName' | 'lastName' | 'designation' | 'email' | 'alternateEmail'
  | 'phone' | 'alternatePhone' | 'whatsappNumber' | 'industry' | 'subIndustry'
  | 'city' | 'state' | 'country' | 'address' | 'postalCode'
  | 'websiteUrl' | 'websiteStatus' | 'linkedinUrl' | 'linkedinCompanyUrl'
  | 'leadSource' | 'assignedTo' | 'budgetAmount' | 'requirementBrief' | 'internalNotes';

/** Where a column goes: a lead field, a name to split, the lead's notes, or nowhere (''). */
export type ColumnTarget = LeadField | 'fullName' | 'nameAndPosition' | 'notes' | '';

export interface TargetOption {
  value: Exclude<ColumnTarget, ''>;
  label: string;
}

export const TARGET_OPTIONS: TargetOption[] = [
  { value: 'companyName', label: 'Company name' },
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'fullName', label: 'Full name (split into first and last)' },
  { value: 'nameAndPosition', label: 'Name and designation ("Name / Designation")' },
  { value: 'designation', label: 'Designation' },
  { value: 'email', label: 'Email' },
  { value: 'alternateEmail', label: 'Secondary email' },
  { value: 'phone', label: 'Phone' },
  { value: 'alternatePhone', label: 'Alternate phone' },
  { value: 'whatsappNumber', label: 'WhatsApp number' },
  { value: 'industry', label: 'Industry' },
  { value: 'subIndustry', label: 'Sub-industry' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'address', label: 'Address' },
  { value: 'postalCode', label: 'Pincode' },
  { value: 'websiteUrl', label: 'Website' },
  { value: 'websiteStatus', label: 'Website status' },
  { value: 'linkedinUrl', label: 'LinkedIn profile' },
  { value: 'linkedinCompanyUrl', label: 'Company LinkedIn' },
  { value: 'leadSource', label: 'Lead source' },
  { value: 'assignedTo', label: 'Assigned to' },
  { value: 'budgetAmount', label: 'Budget' },
  { value: 'requirementBrief', label: 'Requirement' },
  { value: 'internalNotes', label: 'Internal notes' },
  { value: 'notes', label: 'Keep in internal notes' },
];

export const targetLabel = (target: ColumnTarget) => TARGET_OPTIONS.find((o) => o.value === target)?.label ?? "Don't import";

/**
 * Header names each target is recognised by, most specific first. Pairs are
 * tried in this order across all columns, so "Personal LinkedIn" claims the
 * profile field before a bare "LinkedIn" column is considered.
 */
const SYNONYMS: [ColumnTarget, string[]][] = [
  ['companyName', ['company name', 'company', 'company_name', 'organisation', 'organization', 'business name', 'firm name', 'firm']],
  ['firstName', ['first name', 'firstname', 'fname']],
  ['lastName', ['last name', 'lastname', 'surname', 'lname']],
  ['nameAndPosition', ['name & position', 'name and position', 'name & designation', 'name and designation', 'name / designation']],
  ['fullName', ['full name', 'contact person', 'contact name', 'person name', 'name']],
  ['designation', ['designation', 'position', 'job title', 'title', 'role']],
  ['alternateEmail', ['secondary email', 'email 2', 'alternate email', 'alt email', 'other email', 'email2']],
  ['email', ['email', 'email id', 'email address', 'e-mail', 'mail']],
  ['whatsappNumber', ['whatsapp number', 'whatsapp', 'whatsapp no', 'wa number']],
  ['alternatePhone', ['alternate phone', 'phone 2', 'mobile 2', 'alternate number', 'other phone', 'landline']],
  ['phone', ['phone', 'mobile', 'mobile number', 'phone number', 'contact number', 'contact no', 'mobile no', 'phone no']],
  ['subIndustry', ['sub industry', 'sub-industry', 'sub_industry', 'subindustry', 'sub sector']],
  ['industry', ['industry', 'sector']],
  ['city', ['city', 'location', 'town']],
  ['state', ['state', 'region', 'province']],
  ['country', ['country']],
  ['postalCode', ['pincode', 'pin code', 'postal code', 'zip', 'zip code', 'postcode']],
  ['address', ['address', 'full address', 'street address']],
  ['websiteStatus', ['website status', 'website state']],
  ['linkedinUrl', ['personal linkedin url', 'personal linkedin', 'personal linkedin profile', 'linkedin profile url']],
  ['linkedinCompanyUrl', ['linkedin company url', 'company linkedin profile', 'company linkedin', 'website linkedin', 'linkedin company', 'linkedin page']],
  ['websiteUrl', ['website url', 'website', 'website link', 'web', 'url', 'site']],
  ['leadSource', ['lead source', 'source']],
  ['assignedTo', ['assigned to', 'assignee', 'owner', 'sales person', 'salesperson', 'bdm']],
  ['budgetAmount', ['budget amount', 'budget', 'deal value']],
  ['requirementBrief', ['requirement', 'requirement brief', 'service interested', 'services interested', 'requirements']],
  ['internalNotes', ['internal notes', 'notes', 'note', 'remarks', 'personal note', 'comments']],
  // Generic names last: only when the specific columns are absent.
  ['linkedinUrl', ['linkedin', 'linkedin url']],
  ['linkedinCompanyUrl', ['linkedin']],
  ['country', ['country code']],
];

/** Columns that only number the rows: a "#"-style header, or values 1, 2, 3… */
const ROW_NUMBER_HEADERS = new Set(['no', 'sr', 'srno', 'sno', 'serialno', 'slno']);
const isRowNumbering = (header: string, values: string[]) =>
  header.trim() === '#' || ROW_NUMBER_HEADERS.has(compact(header)) || (values.length > 0 && values.every((value, i) => value === String(i + 1)));

const normalise = (header: string) => header.toLowerCase().replace(/[^a-z0-9&/]+/g, ' ').trim();
const compact = (header: string) => header.toLowerCase().replace(/[^a-z0-9]+/g, '');

export interface Sheet {
  name: string;
  /** Cell text, row by row, from the sheet's first row. */
  rows: string[][];
  /** The spreadsheet row number of rows[0] (1-based). */
  firstRowNumber: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (date: { y: number; m: number; d: number }) => `${date.y}-${pad(date.m)}-${pad(date.d)}`;

/** Excel's serial day number as yyyy-mm-dd, for date cells the sheet stores as numbers. */
export function excelSerialToDate(serial: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  return parsed && parsed.y > 1900 ? isoDate(parsed) : null;
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v;
    return isoDate({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
  }
  if (cell.t === 'n' && typeof cell.v === 'number') {
    if (cell.z && XLSX.SSF.is_date(String(cell.z))) return excelSerialToDate(cell.v) ?? String(cell.v);
    // Whole numbers in full (phone numbers, pincodes), never in exponent form.
    return Number.isInteger(cell.v) ? cell.v.toFixed(0) : String(cell.v);
  }
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE';
  return String(cell.v).trim();
}

/** Every sheet of a workbook (XLSX, XLS or CSV), as text, with real row numbers. */
export function readWorkbook(data: ArrayBuffer): Sheet[] {
  const workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellNF: true, cellDates: false });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet?.['!ref']) return { name, rows: [], firstRowNumber: 1 };
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rows: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const row: string[] = [];
      for (let c = 0; c <= range.e.c; c += 1) row.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })]));
      rows.push(row);
    }
    return { name, rows, firstRowNumber: range.s.r + 1 };
  });
}

const knownHeader = (header: string) => {
  const name = normalise(header);
  return SYNONYMS.some(([, names]) => names.includes(name));
};

/**
 * The index of the header row: among the first ten rows, the one naming the
 * most known lead columns (a title or summary row above the headers is
 * skipped); the first non-empty row when none names any.
 */
export function detectHeaderRow(rows: string[][]): number {
  let best = -1;
  let bestScore = 0;
  rows.slice(0, 10).forEach((row, index) => {
    const score = row.filter((cell) => cell && knownHeader(cell)).length;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  if (best >= 0) return best;
  const firstFilled = rows.findIndex((row) => row.some(Boolean));
  return firstFilled < 0 ? 0 : firstFilled;
}

/** Rows under the header that hold anything. */
export const dataRows = (sheet: Sheet, headerIndex: number) => sheet.rows.slice(headerIndex + 1).filter((row) => row.some(Boolean)).length;

/** How well a sheet's headers match lead columns, to open the likeliest sheet first. */
export function sheetScore(sheet: Sheet) {
  if (/master|message|credential/i.test(sheet.name)) return -1;
  const header = sheet.rows[detectHeaderRow(sheet.rows)] ?? [];
  return header.filter((cell) => cell && knownHeader(cell)).length;
}

/**
 * The suggested target of each column: known headers to their lead field, row
 * numbers to nothing, and any other column that holds data to the lead's notes,
 * so nothing in the file is dropped unless the person chooses to drop it.
 */
export function suggestMapping(headers: string[], rows: string[][] = []): ColumnTarget[] {
  const mapping: ColumnTarget[] = headers.map(() => '');
  const claimed = new Set<ColumnTarget>();
  for (const [target, names] of SYNONYMS) {
    if (claimed.has(target)) continue;
    for (const name of names) {
      const column = headers.findIndex((header, i) => !mapping[i] && normalise(header) === name);
      if (column >= 0) {
        mapping[column] = target;
        claimed.add(target);
        break;
      }
    }
  }
  // A full name is only needed when the sheet has no first-name column.
  if (claimed.has('firstName')) {
    mapping.forEach((target, i) => {
      if (target === 'fullName' || target === 'nameAndPosition') mapping[i] = 'notes';
    });
  }
  headers.forEach((header, i) => {
    if (mapping[i]) return;
    const values = rows.map((row) => row[i] ?? '').filter(Boolean);
    if (values.length && !isRowNumbering(header, values)) mapping[i] = 'notes';
  });
  return mapping;
}

/** Lead fields chosen for more than one column; each may be used once. */
export function duplicateTargets(mapping: ColumnTarget[]): ColumnTarget[] {
  const seen = new Set<ColumnTarget>();
  const repeated = new Set<ColumnTarget>();
  for (const target of mapping) {
    if (!target || target === 'notes') continue;
    if (seen.has(target)) repeated.add(target);
    seen.add(target);
  }
  return [...repeated];
}

/** Which required lead values the mapping does not provide. */
export function missingRequired(mapping: ColumnTarget[]): string[] {
  const has = (...targets: ColumnTarget[]) => targets.some((t) => mapping.includes(t));
  return [
    !has('companyName') && 'Company name',
    !has('firstName', 'fullName', 'nameAndPosition') && 'First name (or a full name column)',
    !has('email') && 'Email',
  ].filter((label): label is string => Boolean(label));
}

export type ImportRow = { rowNumber: number } & Partial<Record<LeadField, string>>;

const HONORIFIC = /^(mr|mrs|ms|miss|shri|smt)\.?\s+/i;
const EMAIL_IN_TEXT = /[^\s@/,;]+@[^\s@/,;]+\.[^\s@/,;]+/g;

function splitName(value: string) {
  const parts = value.replace(HONORIFIC, '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

const looksLikeSerialDate = (header: string, value: string) => /date|contacted|follow/i.test(header) && /^\d{5}$/.test(value) && Number(value) > 20000 && Number(value) < 80000;

/**
 * The rows to send: each non-empty row under the header, its mapped cells as
 * lead fields, and every column kept in notes appended to the internal notes
 * as "Header: value". A cell holding several emails gives the first as the
 * email and the rest as the secondary email (or notes, when that is taken).
 */
export function buildRows(sheet: Sheet, headerIndex: number, mapping: ColumnTarget[]): ImportRow[] {
  const headers = sheet.rows[headerIndex] ?? [];
  const result: ImportRow[] = [];
  sheet.rows.forEach((cells, index) => {
    if (index <= headerIndex || !cells.some(Boolean)) return;
    const row: ImportRow = { rowNumber: sheet.firstRowNumber + index };
    const notes: string[] = [];
    const set = (field: LeadField, value: string) => {
      if (value && !row[field]) row[field] = value;
    };
    mapping.forEach((target, column) => {
      const raw = (cells[column] ?? '').trim();
      if (!raw || !target) return;
      const header = headers[column] || `Column ${column + 1}`;
      if (target === 'notes') {
        notes.push(`${header}: ${looksLikeSerialDate(header, raw) ? excelSerialToDate(Number(raw)) ?? raw : raw}`);
      } else if (target === 'fullName') {
        const { first, last } = splitName(raw);
        set('firstName', first);
        set('lastName', last);
      } else if (target === 'nameAndPosition') {
        const [name, ...position] = raw.split(/\s*[/|]\s*|\s+-\s+|,\s*/);
        const { first, last } = splitName(name ?? '');
        set('firstName', first);
        set('lastName', last);
        set('designation', position.join(', ').trim());
      } else if (target === 'email' || target === 'alternateEmail') {
        const found = raw.match(EMAIL_IN_TEXT) ?? [];
        if (found.length <= 1) {
          set(target, raw);
        } else {
          set(target, found[0] ?? raw);
          const rest = found.slice(1);
          if (target === 'email' && !mapping.includes('alternateEmail')) set('alternateEmail', rest.shift() ?? '');
          if (rest.length) notes.push(`${header}: ${rest.join(', ')}`);
        }
      } else {
        set(target, raw);
      }
    });
    if (notes.length) row.internalNotes = [row.internalNotes, ...notes].filter(Boolean).join('\n');
    result.push(row);
  });
  return result;
}
