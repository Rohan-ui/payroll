import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Loaded once with the file (the whole app is large), not inside a timed test.
import { App } from './App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Sign-in through the real app (router, auth context and API client): a failed
 * sign-in keeps the form as typed, and a temporary password leads to the
 * forced change, which sends only the new password on the signed-in session.
 */

const SESSION = {
  token: 'session-token',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  user: { id: 'u1', email: 'owner@acme.example', displayName: 'Asha', mustChangePassword: true },
  activeTenant: { tenantId: 't1', tenantCode: 'ACME', displayName: 'Acme', legalName: 'Acme Pvt Ltd', roles: ['ADMIN'] },
  availableTenants: [],
  access: { permissions: [], modules: {}, navigation: [] },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let container: HTMLDivElement;
let root: Root | null = null;
const calls: { url: string; method: string; body: unknown; auth: string | null }[] = [];
let loginReplies: Response[] = [];

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null, auth: headers.get('Authorization') });
      if (url.endsWith('/auth/login')) return loginReplies.shift() ?? json(500, {});
      if (url.endsWith('/auth/change-password')) return json(200, { success: true });
      return json(200, { success: true, data: [] });
    }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

const fill = (element: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

const signInForm = () => container.querySelector('form') as HTMLFormElement;
const emailField = () => signInForm().querySelector('input[type=email]') as HTMLInputElement;
const passwordField = () => signInForm().querySelector('input[type=password], input[type=text]:not([type=email])') as HTMLInputElement;

const renderApp = async () => {
  act(() => root?.render(<App />));
  await flush();
};

describe('signing in', () => {
  it('keeps what was typed after a failed sign-in and shows why, without ending anything', async () => {
    loginReplies = [json(401, { statusCode: 401, message: 'Invalid email or password.' })];
    await renderApp();
    fill(emailField(), 'owner@acme.example');
    fill(passwordField(), 'wrong-password');
    await act(async () => signInForm().requestSubmit());
    await flush();

    expect(emailField().value).toBe('owner@acme.example');
    expect(container.textContent).toContain('Invalid email or password.');
    expect(container.textContent).not.toContain('Your session ended');
  });

  it('takes a temporary password to the forced change, which sends only the new password on that session', async () => {
    loginReplies = [json(200, SESSION)];
    await renderApp();
    fill(emailField(), 'owner@acme.example');
    fill(passwordField(), 'Temp0rary9Pass16');
    await act(async () => signInForm().requestSubmit());
    await flush();

    expect(container.textContent).toContain('Choose your new password');
    fill(container.querySelector('#new-password') as HTMLInputElement, 'My-own-password-1');
    fill(container.querySelector('#confirm-password') as HTMLInputElement, 'My-own-password-1');
    await act(async () => (container.querySelector('button[type=submit]') as HTMLButtonElement).click());
    await flush();

    const change = calls.find((c) => c.url.endsWith('/auth/change-password'));
    expect(change).toMatchObject({ method: 'POST', body: { newPassword: 'My-own-password-1' }, auth: 'Bearer session-token' });
    expect(container.textContent).not.toContain('Choose your new password');
  });
});
