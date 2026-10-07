import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * The COSEC settings form: what is typed in the password box is what Save
 * sends; a blank box sends no password (the saved one is kept), and says so.
 */

const api = vi.hoisted(() => ({
  getCosecConfig: vi.fn(), saveCosecConfig: vi.fn(), testConnection: vi.fn(), getUsers: vi.fn(), getMonthlyAttendance: vi.fn(), getDailyAttendance: vi.fn(), getSyncStatus: vi.fn(),
}));
vi.mock('../api/external-api.api', () => ({ externalApiClient: api }));
vi.mock('../context/PayrollContext', () => ({ usePayroll: () => ({ refreshData: vi.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const { ComplianceSettingsView } = await import('./ComplianceSettingsView');

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  const saved = { baseUrl: 'http://103.83.155.90:83/COSEC', username: 'sa', passwordSet: true };
  api.getCosecConfig.mockResolvedValue(saved);
  api.saveCosecConfig.mockResolvedValue(saved);
  for (const fn of [api.getUsers, api.getMonthlyAttendance, api.getDailyAttendance]) fn.mockResolvedValue({ data: [] });
  api.getSyncStatus.mockResolvedValue({ configured: true, autoSyncEnabled: true, lastStartedAt: null, lastFinishedAt: null, lastStatus: null, lastError: null, lastChangedRecords: 0, lastUnmatchedUsers: 0, workerSilent: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const flush = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
/** The settings page, on its API Config tab. */
const open = async () => {
  await act(async () => root.render(<ComplianceSettingsView />));
  act(() => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('API Config'))!.click());
  await flush();
};
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
/** Types into an input the way a browser does (React listens for "input"). */
const type = (el: HTMLInputElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });

it('sends the typed password on Save, and says it replaced the saved one', async () => {
  await open();
  const password = container.querySelector('#cosec-password') as HTMLInputElement;
  expect(password.value).toBe('');
  expect(password.placeholder).toBe('Saved — type a new password to replace it');
  expect(password.getAttribute('autocomplete')).toBe('new-password');

  await type(password, 'Real-Cosec-Pass');
  expect(container.textContent).toContain('This replaces the saved password when you save.');
  await act(async () => button('Save Configuration').click());
  await flush();
  expect(api.saveCosecConfig).toHaveBeenCalledWith({ baseUrl: 'http://103.83.155.90:83/COSEC', username: 'sa', password: 'Real-Cosec-Pass' });
  expect(container.textContent).toContain('Configuration saved with the new password.');
  expect(password.value).toBe('');
});

it('sends no password when the box is left blank, and says the saved one was kept', async () => {
  await open();
  await act(async () => button('Save Configuration').click());
  await flush();
  expect(api.saveCosecConfig).toHaveBeenCalledWith({ baseUrl: 'http://103.83.155.90:83/COSEC', username: 'sa' });
  expect(container.textContent).toContain('Configuration saved. The saved password was kept.');
});
