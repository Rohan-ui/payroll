import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The full and final settlement panel (API stubbed): it shows how each amount
 * was worked out, holds back submitting while something is unresolved, and
 * offers each person only the step their permissions allow.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: (p: string) => granted.has(p) }) }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { SettlementPanel } = await import('./SettlementPanel');

const settlement = (extra: Record<string, unknown> = {}) => ({
  id: 'f1', version: 1, status: 'DRAFT', currency: 'INR', totals: { earnings: '132692.31', recoveries: '30000.00', net: '102692.31' },
  lines: [
    { id: 'l0', kind: 'EARNING', code: 'FINAL_SALARY', label: 'Final month salary (paid through payroll)', calculatedAmount: '50000.00', amount: '50000.00', countsInTotal: false, isManual: false, adjustmentReason: null, basis: { rule: 'Net pay on the finalized payslip' } },
    { id: 'l1', kind: 'EARNING', code: 'GRATUITY', label: 'Gratuity', calculatedAmount: '121153.85', amount: '121153.85', countsInTotal: true, isManual: false, adjustmentReason: null, basis: { rule: 'BASIC + DA × 15 ÷ 26 × years' } },
    { id: 'l2', kind: 'RECOVERY', code: 'LOAN_RECOVERY', label: 'Loan recovery: L-1', calculatedAmount: '10000.00', amount: '8000.00', countsInTotal: true, isManual: false, adjustmentReason: 'Part waived by CFO', basis: { rule: 'Instalments not yet recovered' } },
  ],
  problems: [], finalPayslip: null, calculatedAt: '2025-09-01T05:00:00.000Z', preparedBy: 'Priya', submittedBy: null, submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNotes: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectionReason: null, paidBy: null, paidAt: null, payment: null, closedBy: null, closeReason: null, ...extra,
});

let current: Record<string, unknown> | null;
let calls: { method: string; path: string; body: unknown }[];
let container: HTMLDivElement;
let root: Root;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  calls = [];
  current = settlement();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/api\/v1/, '').split('?')[0];
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path.endsWith('/submit')) current = settlement({ status: 'PENDING_REVIEW', submittedBy: 'Priya' });
    if (path.endsWith('/settlement') && method === 'POST') current = settlement();
    return json({ success: true, data: { current, history: current ? [{ id: 'f1', version: 1, status: (current as { status: string }).status, net: '102692.31', createdAt: '2025-09-01T05:00:00.000Z' }] : [], canPrepare: !current } });
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

const settle = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const render = async () => { await act(async () => root.render(<SettlementPanel separationId="s1" employeeName="Sneha Patil" today="2025-09-10" />)); await settle(); };
const button = (text: RegExp) => [...document.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '')) as HTMLButtonElement | undefined;
const click = async (el: HTMLElement) => { await act(async () => el.click()); await settle(); };

describe('settlement panel', () => {
  it('prepares a settlement when there is none', async () => {
    granted = new Set(['offboarding.settlement.view', 'offboarding.settlement.manage']);
    current = null;
    await render();
    expect(container.textContent).toContain('No settlement yet');
    await click(button(/Prepare settlement/)!);
    expect(calls.some((c) => c.method === 'POST' && c.path === '/offboarding/separations/s1/settlement')).toBe(true);
    expect(container.textContent).toContain('Gratuity');
  });

  it('shows how each amount was worked out, what was changed and why, and keeps the paid salary out of the total', async () => {
    granted = new Set(['offboarding.settlement.view', 'offboarding.settlement.manage']);
    await render();
    expect(container.textContent).toContain('BASIC + DA × 15 ÷ 26 × years');
    expect(container.textContent).toContain('Changed from ₹10,000: Part waived by CFO');
    expect(container.textContent).toContain('not counted');
    expect(container.textContent).toContain('Net payable');
    await click(button(/Submit for review/)!);
    expect(calls.some((c) => c.path === '/offboarding/settlements/f1/submit')).toBe(true);
    expect(container.textContent).toContain('Awaiting review');
  });

  it('holds back submitting while something is unresolved', async () => {
    granted = new Set(['offboarding.settlement.view', 'offboarding.settlement.manage']);
    current = settlement({ problems: ['Finalize payroll for 2025-08 first.'] });
    await render();
    expect(container.textContent).toContain('Finalize payroll for 2025-08 first.');
    expect(button(/Submit for review/)!.disabled).toBe(true);
  });

  it('offers only the steps each permission allows', async () => {
    granted = new Set(['offboarding.settlement.view', 'offboarding.settlement.approve']);
    current = settlement({ status: 'PENDING_REVIEW' });
    await render();
    expect(button(/Submit for review/)).toBeUndefined();
    expect(button(/^Change$/)).toBeUndefined();
    expect(button(/Approve/)!.disabled).toBe(true); // Finance hasn't reviewed it
  });

  it('asks for a specific confirmation before approving a reviewed settlement', async () => {
    granted = new Set(['offboarding.settlement.view', 'offboarding.settlement.approve']);
    current = settlement({ status: 'PENDING_REVIEW', reviewedAt: '2025-09-02T05:00:00.000Z', reviewedBy: 'Arun' });
    await render();
    await click(button(/Approve…/)!);
    expect(document.body.textContent).toContain('Approve Sneha Patil’s settlement of ₹1,02,692.31?');
  });
});
