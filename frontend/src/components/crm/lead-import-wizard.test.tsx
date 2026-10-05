import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as XLSX from 'xlsx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The lead import wizard through the real screen (API stubbed): a sheet is
 * read and mapped, the destination is always chosen by the person, the
 * preview is the server's dry run, and only the explicit Import button saves,
 * after which the result is reported row by row with links onward.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setCrmTab = vi.fn();
vi.mock('../../context/PayrollContext', () => ({ usePayroll: () => ({ setCrmTab }) }));

const { LeadImportWizard } = await import('./LeadImportWizard');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const OPTIONS = {
  pipelines: [
    { id: 'p-sales', name: 'Sales', kind: 'SALES', isDefault: true, stages: [{ id: 's-new', name: 'New' }, { id: 's-qual', name: 'Qualified' }] },
    { id: 'p-out', name: 'Manufacturing Outreach', kind: 'OUTREACH', isDefault: false, stages: [{ id: 's-cad', name: 'In cadence' }] },
  ],
  cadence: { name: '30-Day Multi-Touch SOP', steps: 12, days: 30 },
  assignees: [
    { id: 'm-me', name: 'Ravi Shah', email: 'ravi@rnd.test', eligible: true },
    { id: 'm-neha', name: 'Neha Mishra', email: 'neha@rnd.test', eligible: true },
    { id: 'm-acc', name: 'Accountant', email: 'acc@rnd.test', eligible: false },
  ],
  currentMemberId: 'm-me',
  canImportToOutreach: true,
};

const resultFor = (body: any) => {
  const outreach = body.destination === 'CLIENT_OUTREACH';
  const sop = outreach && !body.pipelineId;
  const done = !body.dryRun;
  return {
    dryRun: Boolean(body.dryRun),
    destination: body.destination,
    pipeline: outreach && !sop ? { id: 'p-out', name: 'Manufacturing Outreach' } : { id: 'p-sales', name: 'Sales' },
    stage: outreach && !sop ? { id: 's-cad', name: 'In cadence' } : sop ? { id: 's-new', name: 'New' } : { id: body.stageId, name: 'Qualified' },
    cadence: outreach ? { name: sop ? '30-Day Multi-Touch SOP' : 'Manufacturing Outreach', steps: 12, days: 30 } : null,
    assignee: body.assigneeMemberId === 'm-neha' ? { id: 'm-neha', name: 'Neha Mishra' } : { id: 'm-me', name: 'Ravi Shah' },
    summary: { processed: 3, ready: done ? 0 : 1, imported: done ? 1 : 0, duplicates: 1, failed: 1, enrolled: done && outreach ? 1 : 0, withWarnings: 0 },
    rows: [
      { rowNumber: 2, outcome: done ? 'IMPORTED' : 'READY', companyName: 'Apex Polymer', email: 'rajesh@apex.test', reasons: [], warnings: [] },
      { rowNumber: 3, outcome: 'DUPLICATE', companyName: 'Apex Again', email: 'rajesh@apex.test', reasons: ['Same email as row 2 of this file.'], warnings: [] },
      { rowNumber: 4, outcome: 'FAILED', companyName: 'No Name Co', email: 'x@nn.test', reasons: ['Missing first name.'], warnings: [] },
    ],
  };
};

let calls: { url: string; method: string; body: any }[] = [];
let options: typeof OPTIONS;
let importResponse: (body: any) => Response;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls = [];
  options = OPTIONS;
  importResponse = (body) => json({ success: true, data: resultFor(body), message: 'ok' });
  setCrmTab.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url === '/api/v1/crm/leads/import/options') return json({ success: true, data: options });
    if (url === '/api/v1/crm/leads/import') return importResponse(body);
    return json({ success: true, data: [] });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement | undefined) => { expect(el).toBeTruthy(); await act(async () => el!.click()); await settle(); };
const select = async (el: HTMLSelectElement, value: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle();
};
const labelled = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim() === text);
  return document.getElementById(label!.htmlFor) as HTMLSelectElement;
};
const importCalls = () => calls.filter((c) => c.url === '/api/v1/crm/leads/import');

function spreadsheet(rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CRM master list'], ['Allowed Industries'], ['Chemicals']]), 'CRM_Masters');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'New Meet CRM');
  return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer], 'BDM.xlsx');
}
const LEAD_ROWS = [
  ['Company Name *', 'First Name *', 'Email *', 'Status', 'Phone'],
  ['Apex Polymer', 'Rajesh', 'rajesh@apex.test', 'Hot', '98250 12345'],
  ['Apex Again', 'Rajesh', 'rajesh@apex.test', '', '98250 12345'],
  ['No Name Co', '', 'x@nn.test', '', ''],
];

async function render(onClose = vi.fn(), onImported = vi.fn()) {
  await act(async () => root.render(<LeadImportWizard isOpen onClose={onClose} onImported={onImported} />));
  await settle();
  return { onClose, onImported };
}

async function upload(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await settle();
}

describe('lead import wizard', () => {
  it('opens the lead sheet of a workbook and counts its rows', async () => {
    await render();
    await upload(spreadsheet(LEAD_ROWS));
    expect(labelled('Sheet').selectedOptions[0].textContent).toBe('New Meet CRM');
    expect(document.body.textContent).toContain('3 rows with data under the header row.');
    expect(button('Next: destination')?.disabled).toBe(false);
  });

  it('never assumes the destination', async () => {
    await render();
    await upload(spreadsheet(LEAD_ROWS));
    await click(button('Next: destination'));
    const radios = [...document.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([false, false]);
    expect(button('Next: map columns')?.disabled).toBe(true);
  });

  it('imports into the 30-day SOP of Client Outreach: preview first, then the explicit import, then the results', async () => {
    const { onClose, onImported } = await render();
    await upload(spreadsheet(LEAD_ROWS));
    await click(button('Next: destination'));
    await act(async () => (document.querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).click());
    await settle();
    expect(labelled('Outreach pipeline').value).toBe('SOP');
    expect([...labelled('Outreach pipeline').options].map((o) => o.textContent)).toEqual(['30-Day Multi-Touch SOP', 'Manufacturing Outreach']);
    expect(document.body.textContent).toContain('Leads join the same 12 steps, 30 days cadence as your other Client Outreach leads');

    await click(button('Next: map columns'));
    expect((document.querySelector('select[aria-label="Import \\"Status\\" as"]') as HTMLSelectElement).value).toBe('notes');
    await click(button('Next: preview'));

    expect(importCalls()).toHaveLength(1);
    expect(importCalls()[0].body).toMatchObject({
      destination: 'CLIENT_OUTREACH', dryRun: true, fileName: 'BDM.xlsx', assigneeMemberId: 'm-me',
      rows: [
        { rowNumber: 2, companyName: 'Apex Polymer', firstName: 'Rajesh', email: 'rajesh@apex.test', phone: '98250 12345', internalNotes: 'Status: Hot' },
        { rowNumber: 3, companyName: 'Apex Again' },
        { rowNumber: 4, companyName: 'No Name Co', email: 'x@nn.test' },
      ],
    });
    expect(importCalls()[0].body.stageId).toBeUndefined();
    expect(importCalls()[0].body.pipelineId).toBeUndefined();
    expect(document.body.textContent).toContain('Same email as row 2 of this file.');
    expect(document.body.textContent).toContain('Missing first name.');
    expect(document.body.textContent).toContain('Destination: Client Outreach · 30-Day Multi-Touch SOP');
    expect(onImported).not.toHaveBeenCalled();

    await click(button('Import 1 lead into Client Outreach'));
    expect(importCalls()).toHaveLength(2);
    expect(importCalls()[1].body.dryRun).toBeUndefined();
    expect(document.body.textContent).toContain('Imported 1 lead of 3 rows into Client Outreach (30-Day Multi-Touch SOP), assigned to Ravi Shah unless a row named another team member.');
    expect(document.body.textContent).toContain('Enrolled in cadence');
    expect(onImported).toHaveBeenCalledTimes(1);

    await click(button('View Client Outreach'));
    expect(setCrmTab).toHaveBeenCalledWith('cold-funnel');
    expect(onClose).toHaveBeenCalled();
  });

  it('imports into a sales pipeline at the chosen stage', async () => {
    await render();
    await upload(spreadsheet(LEAD_ROWS));
    await click(button('Next: destination'));
    await act(async () => (document.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).click());
    await settle();
    expect([...labelled('Sales pipeline').options].map((o) => o.textContent)).toEqual(['Choose a pipeline', 'Sales']);
    await select(labelled('First stage'), 's-qual');
    expect(labelled('Assign leads to').value).toBe('m-me');
    const assignees = [...labelled('Assign leads to').options];
    expect(assignees.map((o) => [o.textContent, o.disabled])).toEqual([['Ravi Shah (you)', false], ['Neha Mishra', false], ["Accountant (role can't view leads)", true]]);
    await select(labelled('Assign leads to'), 'm-neha');
    await click(button('Next: map columns'));
    await click(button('Next: preview'));
    expect(importCalls()[0].body).toMatchObject({ destination: 'SALES_PIPELINE', pipelineId: 'p-sales', stageId: 's-qual', dryRun: true, assigneeMemberId: 'm-neha' });
    expect(document.body.textContent).toContain('Assigned to: Neha Mishra, unless a row names another team member.');
    await click(button('Import 1 lead into the Sales Pipeline'));
    await click(button('View Sales Pipeline'));
    expect(setCrmTab).toHaveBeenCalledWith('pipeline');
  });

  it('offers Client Outreach only to members allowed to enrol leads', async () => {
    options = { ...OPTIONS, canImportToOutreach: false };
    await render();
    await upload(spreadsheet(LEAD_ROWS));
    await click(button('Next: destination'));
    expect((document.querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('Your role cannot add leads to Client Outreach.');
  });

  it('offers the 30-day SOP without any Client Outreach pipeline set up', async () => {
    options = { ...OPTIONS, pipelines: OPTIONS.pipelines.filter((p) => p.kind === 'SALES') };
    await render();
    await upload(spreadsheet(LEAD_ROWS));
    await click(button('Next: destination'));
    await act(async () => (document.querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).click());
    await settle();
    expect([...labelled('Outreach pipeline').options].map((o) => o.textContent)).toEqual(['30-Day Multi-Touch SOP']);
    expect(document.body.textContent).not.toContain('There is no');
    expect(button('Next: map columns')?.disabled).toBe(false);
  });

  it('sends a chosen Client Outreach pipeline', async () => {
    await render();
    await upload(spreadsheet(LEAD_ROWS));
    await click(button('Next: destination'));
    await act(async () => (document.querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).click());
    await settle();
    await select(labelled('Outreach pipeline'), 'p-out');
    await click(button('Next: map columns'));
    await click(button('Next: preview'));
    expect(importCalls()[0].body).toMatchObject({ destination: 'CLIENT_OUTREACH', pipelineId: 'p-out' });
    expect(document.body.textContent).toContain('Destination: Client Outreach · Manufacturing Outreach');
  });

  it('imports a sheet with only company, email and phone columns', async () => {
    await render();
    await upload(spreadsheet([['Company', 'Mobile', 'Email'], ['Techno Tarp', '097277 06665', 'info@technotarp.test']]));
    await click(button('Next: destination'));
    await act(async () => (document.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).click());
    await settle();
    await click(button('Next: map columns'));
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await click(button('Next: preview'));
    expect(importCalls()[0].body.rows).toEqual([{ rowNumber: 2, companyName: 'Techno Tarp', phone: '097277 06665', email: 'info@technotarp.test' }]);
  });

  it('will not continue until company, email and phone are mapped once each', async () => {
    await render();
    await upload(spreadsheet(LEAD_ROWS));
    await click(button('Next: destination'));
    await act(async () => (document.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).click());
    await settle();
    await click(button('Next: map columns'));
    const emailColumn = document.querySelector('select[aria-label="Import \\"Email *\\" as"]') as HTMLSelectElement;
    await select(emailColumn, '');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Map a column to: Email');
    expect(button('Next: preview')?.disabled).toBe(true);
    await select(emailColumn, 'email');
    await select(document.querySelector('select[aria-label="Import \\"Status\\" as"]') as HTMLSelectElement, 'email');
    expect(document.body.textContent).toContain('Email is chosen for more than one column.');
    expect(button('Next: preview')?.disabled).toBe(true);
  });

  it('shows a failed import in place and never reports it as done', async () => {
    const { onImported } = await render();
    importResponse = (body) => (body.dryRun ? json({ success: true, data: resultFor(body) }) : json({ statusCode: 400, message: 'That pipeline is not an active pipeline in this workspace. Reload the page and choose another.' }, 400));
    await upload(spreadsheet(LEAD_ROWS));
    await click(button('Next: destination'));
    await act(async () => (document.querySelectorAll('input[type="radio"]')[0] as HTMLInputElement).click());
    await settle();
    await click(button('Next: map columns'));
    await click(button('Next: preview'));
    await click(button('Import 1 lead into Client Outreach'));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('That pipeline is not an active pipeline in this workspace.');
    expect(document.body.textContent).not.toContain('Imported 1 lead');
    expect(onImported).not.toHaveBeenCalled();
  });

  it('refuses a sheet with more rows than one import takes', async () => {
    await render();
    await upload(spreadsheet([LEAD_ROWS[0], ...Array.from({ length: 1001 }, (_, i) => ['Co', 'A', `a${i}@x.test`, ''])]));
    expect(document.body.textContent).toContain('This sheet has 1,001 rows. Import at most 1,000 at a time');
    expect(button('Next: destination')?.disabled).toBe(true);
  });
});
