import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  buildRows, dataRows, detectHeaderRow, duplicateTargets, excelSerialToDate, missingRequired, readWorkbook, sheetScore, suggestMapping,
  type ColumnTarget,
} from './leadImportSheet';

/** A workbook built in memory, like the ones the BDM team keeps: several sheets, varied headers. */
function workbook(sheets: Record<string, unknown[][]>, bookType: XLSX.BookType = 'xlsx'): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  const bytes = XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;
  return bytes;
}

const TEMPLATE_HEADERS = ['Date Created', 'Company Name *', 'First Name *', 'Last Name', 'Designation', 'Email *', 'Secondary Email', 'Country Code *', 'Phone',
  'Alternate Phone', 'WhatsApp Number', 'Industry *', 'Sub Industry', 'Website URL', 'Website LinkedIn', 'Personal LinkedIn URL', 'City', 'State', 'Country',
  'Address', 'Pincode', 'Website Status', 'Assigned To', 'Lead Source', 'Budget Amount', 'Internal Notes'];

describe('reading a workbook', () => {
  it('reads every sheet with real row numbers, whole numbers in full and date cells as dates', () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['Company', 'Mobile Number', 'Pincode', 'Date'], ['Sam Industries', 919825012345, 396191, 46267]]);
    sheet.D2.z = 'dd-mm-yyyy';
    XLSX.utils.book_append_sheet(wb, sheet, 'Leads');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Allowed Industries'], ['Chemicals']]), 'CRM_Masters');
    const [leads, masters] = readWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    expect(leads.name).toBe('Leads');
    expect(leads.rows[1]).toEqual(['Sam Industries', '919825012345', '396191', '2026-09-02']);
    expect(leads.firstRowNumber).toBe(1);
    expect(sheetScore(leads)).toBeGreaterThan(sheetScore(masters));
  });

  it('reads a CSV file', () => {
    const csv = new TextEncoder().encode('Company,First Name,Email\nAcme,Asha,asha@acme.test\n');
    const [sheet] = readWorkbook(csv.buffer as ArrayBuffer);
    expect(sheet.rows).toEqual([['Company', 'First Name', 'Email'], ['Acme', 'Asha', 'asha@acme.test']]);
  });

  it('turns an Excel serial day into a date', () => {
    expect(excelSerialToDate(46267)).toBe('2026-09-02');
  });
});

describe('finding the header row', () => {
  it('skips a summary row above the headers', () => {
    const rows = [['CAN = 66 | USA = 71 | UAE = 40'], ['#', 'Date', 'Company', 'Name & Position', 'Email', 'Phone'], ['1', '46267', 'Sam Industries', 'B.V. Mathew / CEO', 'bv@sam.test', '98250 12345']];
    expect(detectHeaderRow(rows)).toBe(1);
    expect(dataRows({ name: 'Meet Patel', rows, firstRowNumber: 1 }, 1)).toBe(1);
  });
});

describe('suggesting the mapping', () => {
  it('maps the official template, including "Website LinkedIn" and both country columns', () => {
    const mapping = suggestMapping(TEMPLATE_HEADERS, [TEMPLATE_HEADERS.map(() => 'x')]);
    const byHeader = Object.fromEntries(TEMPLATE_HEADERS.map((h, i) => [h, mapping[i]]));
    expect(byHeader).toMatchObject({
      'Company Name *': 'companyName', 'First Name *': 'firstName', 'Email *': 'email', 'Secondary Email': 'alternateEmail',
      'Website LinkedIn': 'linkedinCompanyUrl', 'Personal LinkedIn URL': 'linkedinUrl', Country: 'country', 'Country Code *': 'notes',
      Pincode: 'postalCode', 'Website Status': 'websiteStatus', 'Assigned To': 'assignedTo', 'Lead Source': 'leadSource',
      'Budget Amount': 'budgetAmount', 'Internal Notes': 'internalNotes', 'Date Created': 'notes',
    });
    expect(missingRequired(mapping)).toEqual([]);
  });

  it('maps the other team sheets by synonym', () => {
    const otomat = ['Company_Name', 'First Name', 'Last Name', 'Mobile Number', 'Language Code', 'Country', 'Email', 'Groups', 'Industry', 'Sub_Industry', 'Website'];
    expect(suggestMapping(otomat, [otomat.map(() => 'x')])).toEqual(
      ['companyName', 'firstName', 'lastName', 'phone', 'notes', 'country', 'email', 'notes', 'industry', 'subIndustry', 'websiteUrl']);
    const smurti = ['#', 'Company', 'Contact Person', 'Mobile', 'Phone 2', 'Email', 'Email 2', ' Company LinkedIn Profile', 'Remarks', 'Notes'];
    expect(suggestMapping(smurti, [['1', ...smurti.slice(1).map(() => 'x')], ['2', ...smurti.slice(1).map(() => 'x')]])).toEqual(
      ['', 'companyName', 'fullName', 'phone', 'alternatePhone', 'email', 'alternateEmail', 'linkedinCompanyUrl', 'notes', 'internalNotes']);
  });

  it('keeps unknown columns that hold data in notes, and leaves empty ones and row numbers out', () => {
    expect(suggestMapping(['', 'Company', 'Status', 'E Sent'], [['1', 'A', 'New', ''], ['2', 'B', '', '']])).toEqual(['', 'companyName', 'notes', '']);
  });

  it('flags a field chosen twice and the required fields not mapped', () => {
    const mapping: ColumnTarget[] = ['email', 'email', 'notes', 'notes', ''];
    expect(duplicateTargets(mapping)).toEqual(['email']);
    expect(missingRequired(mapping)).toEqual(['Company name', 'Phone']);
    expect(missingRequired(['companyName', 'email', 'phone'])).toEqual([]);
  });
});

describe('building the rows to send', () => {
  const sheet = {
    name: 'Meet Patel',
    firstRowNumber: 1,
    rows: [
      ['Summary row'],
      ['#', 'Date', 'Company', 'Name & Position', 'Email', 'Status', 'Personal Note'],
      ['1', '46267', 'Sam Industries', 'Mr. B.V. Mathew / CEO', 'bv@sam.test/ sales@sam.test', 'New', 'Under Indiamart'],
      ['', '', '', '', '', '', ''],
      ['2', '', 'Prince Real Estate', 'Anis Virani - Owner', 'anis@prince.test', '', ''],
    ],
  };

  it('splits names and designations, keeps extra emails and other columns, and numbers rows as in Excel', () => {
    const mapping = suggestMapping(sheet.rows[1], sheet.rows.slice(2));
    expect(mapping).toEqual(['', 'notes', 'companyName', 'nameAndPosition', 'email', 'notes', 'internalNotes']);
    const rows = buildRows(sheet, 1, mapping);
    expect(rows).toEqual([
      {
        rowNumber: 3, companyName: 'Sam Industries', firstName: 'B.V.', lastName: 'Mathew', designation: 'CEO',
        email: 'bv@sam.test', alternateEmail: 'sales@sam.test', internalNotes: 'Under Indiamart\nDate: 2026-09-02\nStatus: New',
      },
      { rowNumber: 5, companyName: 'Prince Real Estate', firstName: 'Anis', lastName: 'Virani', designation: 'Owner', email: 'anis@prince.test' },
    ]);
  });

  it('leaves out columns set to "Don\'t import" and never fills empty cells', () => {
    const rows = buildRows(sheet, 1, ['', '', 'companyName', 'fullName', 'email', '', '']);
    expect(rows[1]).toEqual({ rowNumber: 5, companyName: 'Prince Real Estate', firstName: 'Anis', lastName: 'Virani - Owner', email: 'anis@prince.test' });
  });

  it('reads a full workbook end to end', () => {
    const [read] = readWorkbook(workbook({ 'New Meet CRM': [TEMPLATE_HEADERS, ['2026-03-20', 'Apex Polymer', 'Rajesh', 'Shah', 'MD', 'rajesh@apex.test', '', '+91 (🇮🇳 India)', 9825012345]] }));
    const header = detectHeaderRow(read.rows);
    const [row] = buildRows(read, header, suggestMapping(read.rows[header], read.rows.slice(header + 1)));
    expect(row).toMatchObject({ rowNumber: 2, companyName: 'Apex Polymer', firstName: 'Rajesh', email: 'rajesh@apex.test', phone: '9825012345' });
    expect(row.internalNotes).toBe('Date Created: 2026-03-20\nCountry Code *: +91 (🇮🇳 India)');
  });
});

describe('the outreach start date column', () => {
  it('is recognised by its name and sent as a date, also when Excel stored it as a day number', () => {
    const headers = ['Company Name', 'Email', 'Phone', 'Start Date (Day 1)'];
    const mapping = suggestMapping(headers);
    expect(mapping[3]).toBe('startDate');
    const sheet = { name: 'Leads', firstRowNumber: 1, rows: [headers, ['Apex', 'a@apex.test', '98200 12345', '46315'], ['Beta', 'b@beta.test', '98200 12346', '20/10/2026']] };
    expect(buildRows(sheet, 0, mapping).map((r) => r.startDate)).toEqual(['2026-10-20', '20/10/2026']);
  });
});
