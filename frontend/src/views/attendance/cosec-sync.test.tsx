import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { CosecRefreshNote, useCosecRefresh } from './CosecRefresh';
import { CosecAutoSyncCard } from './CosecAutoSyncCard';

/**
 * COSEC sync on screen: opening an employee's attendance fetches their month
 * from COSEC and reloads only when a day changed, saying how it went; and the
 * settings show the every-minute sync, its switch, and when the worker isn't running.
 */

vi.mock('../../api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});
const flush = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });

const Harness: React.FC<{ employeeId: string; month: string; onChanged: () => void }> = ({ employeeId, month, onChanged }) => (
  <CosecRefreshNote state={useCosecRefresh(employeeId, month, onChanged)} />
);

describe('opening an employee’s attendance', () => {
  it('fetches the month from COSEC and reloads only when a day changed', async () => {
    const reload = vi.fn();
    let answer!: (value: unknown) => void;
    vi.mocked(apiClient.post).mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }) as never);
    await act(async () => root.render(<Harness employeeId="emp-1" month="2026-10" onChanged={reload} />));
    expect(container.textContent).toContain('Fetching the latest punches from COSEC');
    expect(reload).not.toHaveBeenCalled();
    answer({ status: 'SYNCED', syncedAt: '2026-10-07T05:51:00Z', changedRecords: 2, matched: true });
    await flush();
    expect(apiClient.post).toHaveBeenCalledWith('/external-api/cosec/refresh-employee', { employeeId: 'emp-1', month: '2026-10' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/Up to date with COSEC · checked .+ · 2 days updated/);

    // Another month: fetched again; nothing changed, so no reload.
    vi.mocked(apiClient.post).mockResolvedValueOnce({ status: 'SYNCED', syncedAt: '2026-10-07T05:52:00Z', changedRecords: 0, matched: true });
    await act(async () => root.render(<Harness employeeId="emp-1" month="2026-09" onChanged={reload} />));
    await flush();
    expect(apiClient.post).toHaveBeenLastCalledWith('/external-api/cosec/refresh-employee', { employeeId: 'emp-1', month: '2026-09' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('updated');
  });

  it('shows nothing without COSEC, and says so when COSEC has no such user or can’t be reached', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ status: 'NOT_CONFIGURED' });
    await act(async () => root.render(<Harness employeeId="emp-1" month="2026-10" onChanged={() => undefined} />));
    await flush();
    expect(container.textContent).toBe('');

    vi.mocked(apiClient.post).mockResolvedValueOnce({ status: 'SYNCED', syncedAt: '2026-10-07T05:51:00Z', changedRecords: 0, matched: false });
    await act(async () => root.render(<Harness employeeId="emp-2" month="2026-10" onChanged={() => undefined} />));
    await flush();
    expect(container.textContent).toContain('COSEC has no user with this Employee Code');

    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('The latest punches could not be fetched from COSEC: timeout.'));
    await act(async () => root.render(<Harness employeeId="emp-3" month="2026-10" onChanged={() => undefined} />));
    await flush();
    expect(container.querySelector('[role=status]')?.textContent).toContain('could not be fetched from COSEC: timeout. Showing the attendance last synced.');
  });
});

describe('opening the attendance page', () => {
  it('fetches everyone’s month from COSEC, reloads when days changed, and mentions COSEC users with no employee', async () => {
    const reload = vi.fn();
    vi.mocked(apiClient.post).mockResolvedValueOnce({ status: 'SYNCED', syncedAt: '2026-10-10T05:51:00Z', changedRecords: 14, unmatchedUsers: 3 });
    await act(async () => root.render(<Harness employeeId="ALL" month="2026-10" onChanged={reload} />));
    await flush();
    expect(apiClient.post).toHaveBeenCalledWith('/external-api/cosec/refresh-month', { month: '2026-10' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/Up to date with COSEC · checked .+ · 14 days updated · 3 COSEC users have no matching Employee Code/);
  });
});

describe('automatic sync settings', () => {
  const STATUS = {
    configured: true, autoSyncEnabled: true, lastStartedAt: '2026-10-07T05:50:00Z', lastFinishedAt: '2026-10-07T05:50:02Z',
    lastStatus: 'SUCCEEDED', lastError: null, lastChangedRecords: 3, lastUnmatchedUsers: 2, workerSilent: false,
  };

  it('shows the last run and switches the sync off', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(STATUS);
    vi.mocked(apiClient.put).mockResolvedValue({ ...STATUS, autoSyncEnabled: false });
    await act(async () => root.render(<CosecAutoSyncCard />));
    await flush();
    expect(container.textContent).toContain('3 days updated');
    expect(container.textContent).toContain('COSEC users without an employee2');
    const toggle = container.querySelector('[role=switch]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => toggle.click());
    await flush();
    expect(apiClient.put).toHaveBeenCalledWith('/external-api/cosec/auto-sync', { enabled: false });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(container.textContent).toContain('Automatic sync is off.');
  });

  it('warns when the worker is not running, and shows why a sync failed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ ...STATUS, workerSilent: true, lastStatus: 'FAILED', lastError: 'COSEC server did not answer within 30 seconds' });
    await act(async () => root.render(<CosecAutoSyncCard />));
    await flush();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('The COSEC sync worker is not running');
    expect(container.textContent).toContain('COSEC server did not answer within 30 seconds');
  });

  it('says when the switch could not be changed', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(STATUS);
    vi.mocked(apiClient.put).mockRejectedValue(new Error('You do not have permission to change COSEC settings.'));
    await act(async () => root.render(<CosecAutoSyncCard />));
    await flush();
    await act(async () => (container.querySelector('[role=switch]') as HTMLButtonElement).click());
    await flush();
    expect(container.querySelector('[role=alert]')?.textContent).toBe('You do not have permission to change COSEC settings.');
    expect(container.querySelector('[role=switch]')?.getAttribute('aria-checked')).toBe('true');
  });
});
