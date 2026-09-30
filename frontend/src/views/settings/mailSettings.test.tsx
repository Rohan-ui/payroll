import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * My email settings and the administrators' email panel through the real
 * screens (API stubbed): a member saves, tests and disconnects only their own
 * account, the saved password is never shown, a test email goes only when
 * asked, and administrators change the policy with a confirmation and see
 * members' status without any credential.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => granted.has(p), user: { email: 'neha@rnd.test', displayName: 'Neha Mishra' } }),
}));

const { MyEmailSettingsView } = await import('./MyEmailSettingsView');
const { EmailPolicyPanel } = await import('./EmailPolicyPanel');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const PROVIDERS = [
  { code: 'GMAIL', label: 'Gmail or Google Workspace', smtp: { host: 'smtp.gmail.com', port: 465, security: 'SSL' }, imap: { host: 'imap.gmail.com', port: 993, security: 'SSL' }, senderMustMatchUsername: true, note: 'Google needs an app password.' },
  { code: 'MICROSOFT_365', label: 'Microsoft 365 / Outlook', smtp: { host: 'smtp.office365.com', port: 587, security: 'STARTTLS' }, imap: { host: 'outlook.office365.com', port: 993, security: 'SSL' }, senderMustMatchUsername: true, note: 'SMTP AUTH must be allowed.' },
  { code: 'CUSTOM', label: 'Another mail server', smtp: null, imap: null, senderMustMatchUsername: false, note: 'Use your provider’s details.' },
];
const ACCOUNT = {
  provider: 'GMAIL', smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecurity: 'SSL', smtpUsername: 'neha@rnd.test', hasSmtpPassword: true, senderEmail: 'neha@rnd.test', senderName: 'Neha Mishra',
  replyToEmail: null, imapEnabled: false, imapHost: null, imapPort: null, imapSecurity: null, imapUsername: null, imapUsesSmtpPassword: false, hasImapPassword: false, enabled: true,
  smtpStatus: 'CONNECTED', smtpLastTestedAt: '2026-10-01T10:00:00Z', smtpLastSuccessAt: '2026-10-01T10:00:00Z', smtpLastError: null, imapStatus: 'DISCONNECTED', imapLastTestedAt: null,
  imapLastSuccessAt: null, imapLastError: null, updatedAt: '2026-10-01T10:00:00Z',
};
const mine = (account: unknown, extra: Record<string, unknown> = {}) => ({ policy: { personalAccounts: 'ALLOWED' }, gmail: { connected: false, email: null }, sendsFrom: account ? 'PERSONAL' : 'ORGANIZATION', account, providers: PROVIDERS, ...extra });

let calls: { url: string; method: string; body: unknown }[] = [];
let current: ReturnType<typeof mine>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['organization.view', 'organization.update', 'users.view']);
  calls = [];
  current = mine(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });
      if (url === '/api/v1/mail-accounts/me' && method === 'PUT') { current = mine(ACCOUNT); return json({ success: true, data: current }); }
      if (url === '/api/v1/mail-accounts/me' && method === 'DELETE') { current = mine({ ...ACCOUNT, enabled: false, hasSmtpPassword: false, smtpStatus: 'DISCONNECTED' }, { sendsFrom: 'ORGANIZATION' }); return json({ success: true, data: current }); }
      if (url === '/api/v1/mail-accounts/me') return json({ success: true, data: current });
      if (url.endsWith('/me/test-smtp')) return json({ success: true, data: { ok: false, message: 'smtp.gmail.com rejected the SMTP username or password.' } });
      if (url.endsWith('/me/test-email')) return json({ success: true, data: { ok: true, message: 'The test email was accepted for delivery to boss@rnd.test.' } });
      if (url.endsWith('/mail-accounts/policy')) return json({ success: true, data: { personalAccounts: body.personalAccounts } });
      if (url.endsWith('/mail-accounts/members'))
        return json({ success: true, data: [
          { name: 'Neha Mishra', loginEmail: 'neha@rnd.test', gmail: null, account: { provider: 'GMAIL', senderEmail: 'neha@rnd.test', enabled: true, smtpStatus: 'CONNECTED', smtpLastSuccessAt: '2026-10-01T10:00:00Z', imapEnabled: false, imapStatus: 'DISCONNECTED' } },
          { name: 'Meet Patel', loginEmail: 'meet@rnd.test', gmail: null, account: null },
          { name: 'Sagar Bhanushali', loginEmail: 'sagar@rnd.test', gmail: 'sagar@gmail.test', account: null },
        ] });
      return json({ success: true, data: null });
    }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
const button = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
const byLabel = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(text));
  return document.getElementById(label?.getAttribute('for') ?? '') as HTMLInputElement & HTMLSelectElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(() => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set?.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });

describe('My email settings', () => {
  it('connects the member’s own account with a preset, checking the password is given, and sends nothing', async () => {
    await act(async () => root.render(<MyEmailSettingsView />));
    await settle();
    expect(container.textContent).toContain('go out from the organization’s email account');
    expect(byLabel('SMTP host').value).toBe('smtp.gmail.com');
    expect(byLabel('Sender email').readOnly).toBe(true);
    await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Enter the password or app password.');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    setValue(byLabel('Provider'), 'MICROSOFT_365');
    expect([byLabel('SMTP host').value, byLabel('Port').value, byLabel('Security').value]).toEqual(['smtp.office365.com', '587', 'STARTTLS']);
    expect(container.textContent).toContain('SMTP AUTH must be allowed.');
    setValue(byLabel('Password or app password'), 'secret-app-pass');
    await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
    await settle();
    const saved = calls.find((c) => c.method === 'PUT');
    expect(saved?.body).toMatchObject({ provider: 'MICROSOFT_365', smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecurity: 'STARTTLS', smtpUsername: 'neha@rnd.test', senderEmail: 'neha@rnd.test', smtpPassword: 'secret-app-pass', imapEnabled: false });
    expect(calls.some((c) => c.url.includes('test'))).toBe(false);
    expect(container.textContent).toContain('go out from your account, neha@rnd.test');
    expect(container.innerHTML).not.toContain('secret-app-pass');
    expect(container.textContent).toContain('password saved');
  });

  it('shows the account’s status and a safe test result', async () => {
    current = mine(ACCOUNT);
    await act(async () => root.render(<MyEmailSettingsView />));
    await settle();
    expect(container.textContent).toContain('Connected');
    expect(container.textContent).toContain('Last worked');
    await act(async () => button('Test connection')?.click());
    await settle();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('rejected the SMTP username or password.');
  });

  it('keeps the saved password hidden when editing, and asks for it again when the server changes', async () => {
    current = mine(ACCOUNT);
    await act(async () => root.render(<MyEmailSettingsView />));
    await settle();
    act(() => button('Edit')?.click());
    const password = byLabel('Password or app password');
    expect(password.value).toBe('');
    expect(password.getAttribute('placeholder')).toBe('Saved. Leave empty to keep it');
    setValue(byLabel('SMTP host'), 'smtp.other.test');
    expect(container.textContent).toContain('You changed the server or username, so enter the password again.');
    await act(async () => (container.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(container.querySelector('[role=alert]')?.textContent).toBe('You changed the server or username: enter the password again.');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('sends a test email only after the member asks, to the address they choose', async () => {
    current = mine(ACCOUNT);
    await act(async () => root.render(<MyEmailSettingsView />));
    await settle();
    expect(calls.some((c) => c.url.endsWith('/test-email'))).toBe(false);
    act(() => button('Send test email')?.click());
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    setValue(byLabel('Send to'), 'boss@rnd.test');
    await act(async () => button('Send test email', dialog)?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/test-email'))?.body).toEqual({ recipient: 'boss@rnd.test' });
    expect(container.querySelector('[role=status]')?.textContent).toContain('accepted for delivery');
  });

  it('disconnects after a clear confirmation', async () => {
    current = mine(ACCOUNT);
    await act(async () => root.render(<MyEmailSettingsView />));
    await settle();
    act(() => button('Disconnect')?.click());
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.querySelector('h2')?.textContent).toBe('Disconnect your mail account?');
    expect(dialog.textContent).toContain('saved passwords are deleted');
    await act(async () => button('Disconnect account', dialog)?.click());
    await settle();
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/api/v1/mail-accounts/me');
    expect(container.textContent).toContain('Connect your mail account');
  });

  it('says so when the workspace sends everything from the organization', async () => {
    current = mine(ACCOUNT, { policy: { personalAccounts: 'ORGANIZATION_ONLY' }, sendsFrom: 'ORGANIZATION' });
    await act(async () => root.render(<MyEmailSettingsView />));
    await settle();
    expect(container.textContent).toContain('Your workspace sends all email from the organization’s account.');
  });
});

describe('members’ email accounts (administrators)', () => {
  it('changes the policy only after confirming, and shows who has connected without credentials', async () => {
    current = mine(null, { policy: { personalAccounts: 'ORGANIZATION_ONLY' } });
    await act(async () => root.render(<EmailPolicyPanel />));
    await settle();
    expect(container.textContent).toContain('2 of 3 members have connected an email account');
    const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.textContent);
    expect(rows[0]).toContain('Connected');
    expect(rows[1]).toContain('Not set up');
    expect(rows[2]).toContain('Gmail connected');
    expect(container.innerHTML).not.toMatch(/password/i);

    const allowed = container.querySelector('input[value=ALLOWED]') as HTMLInputElement;
    act(() => allowed.click());
    expect(calls.some((c) => c.url.endsWith('/policy'))).toBe(false);
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.querySelector('h2')?.textContent).toBe('Let members send from their own accounts?');
    await act(async () => button('Change policy', dialog)?.click());
    await settle();
    expect(calls.find((c) => c.url.endsWith('/policy'))?.body).toEqual({ personalAccounts: 'ALLOWED' });
    expect((container.querySelector('input[value=ALLOWED]') as HTMLInputElement).checked).toBe(true);
  });

  it('is read-only without permission to edit organization settings, and hides the members list without users.view', async () => {
    granted = new Set(['organization.view']);
    await act(async () => root.render(<EmailPolicyPanel />));
    await settle();
    expect((container.querySelector('input[value=ALLOWED]') as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('table')).toBeNull();
    expect(calls.some((c) => c.url.endsWith('/members'))).toBe(false);
  });
});
