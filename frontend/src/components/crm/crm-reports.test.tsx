import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CRM reports (API stubbed): figures come from the server summary, not from
 * leads in the browser, stages open the board, and there are no made-up
 * "insights".
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { default: CRMAnalytics } = await import('./CRMAnalytics');

const SUMMARY = {
  totals: { openCount: 2, openValue: '150000.00', weightedForecast: '60000.00', wonCount: 1, wonValue: '200000.00', lostCount: 1, winRate: 50, averageWon: '200000.00' },
  stages: [
    { id: 's1', name: 'New', color: '#2563eb', pipelineId: 'p1', pipelineName: 'Sales', count: 2, value: '150000.00' },
    { id: 's2', name: 'Proposal', color: '#16a34a', pipelineId: 'p1', pipelineName: 'Sales', count: 0, value: '0.00' },
    { id: 's3', name: 'Intro', color: '#9333ea', pipelineId: 'p2', pipelineName: 'Partners', count: 1, value: '5000.00' },
  ],
  sources: [{ name: 'Website', leads: 4, won: 1, value: '360000.00' }],
  assignees: [{ name: 'Sana Seller', open: 1, openValue: '100000.00', won: 0 }],
  wonByMonth: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, won: i === 10 ? 1 : 0, value: i === 10 ? '200000.00' : '0.00' })),
};

let container: HTMLDivElement;
let root: Root;
let reply: () => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  reply = () => json({ success: true, data: SUMMARY });
  vi.stubGlobal('fetch', vi.fn(async () => reply()));
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

describe('CRM reports', () => {
  it('shows the server’s figures, opens a stage on the board, and invents no insights', async () => {
    const onSelectStage = vi.fn();
    await act(async () => root.render(<CRMAnalytics onSelectStage={onSelectStage} />));
    await settle();
    expect(container.textContent).toContain('Open pipeline₹1,50,000');
    expect(container.textContent).toContain('Win rate50%');
    expect(container.textContent).toContain('Of 2 closed');
    expect(container.textContent).toContain('Sana Seller');
    expect(container.textContent).not.toMatch(/Voogyo AI|Next Best|higher deal sizes/);
    // Only the chosen pipeline's stages.
    expect(container.textContent).not.toContain('Intro');
    const stage = container.querySelector('button[aria-label^="New: 2 deals"]') as HTMLButtonElement;
    act(() => stage.click());
    expect(onSelectStage).toHaveBeenCalledWith('s1');
  });

  it('says plainly when nothing has closed yet, and shows the error with a retry', async () => {
    reply = () => json({ success: true, data: { ...SUMMARY, totals: { ...SUMMARY.totals, wonCount: 0, lostCount: 0, winRate: null, averageWon: null } } });
    await act(async () => root.render(<CRMAnalytics />));
    await settle();
    expect(container.textContent).toContain('No deals closed yet');

    act(() => root.unmount());
    root = createRoot(container);
    reply = () => json({ message: 'Server unavailable' }, 500);
    await act(async () => root.render(<CRMAnalytics />));
    await settle();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
  });
});
