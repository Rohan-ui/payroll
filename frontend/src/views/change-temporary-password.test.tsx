import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, ToastItem } from '../lib/toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const completePasswordChange = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'owner@acme.example', displayName: 'Asha', mustChangePassword: true },
    activeTenant: { tenantId: 't1', tenantCode: 'ACME', displayName: 'Acme', legalName: 'Acme Pvt Ltd', roles: ['ADMIN'] },
    completePasswordChange,
    logout: vi.fn(),
  }),
}));

vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

const { ChangeTemporaryPasswordView } = await import('./ChangeTemporaryPasswordView');

let container: HTMLDivElement;
let root: Root | null = null;
let shown: ToastItem[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  completePasswordChange.mockReset();
  toast.reset();
  unsubscribe = toast.subscribe((items) => (shown = items));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<ChangeTemporaryPasswordView />));
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  unsubscribe();
});

const fill = (id: string, value: string) =>
  act(() => {
    const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
const submit = () => container.querySelector<HTMLButtonElement>('button[type=submit]')!;

describe('replacing a temporary password', () => {
  it('names the account and workspace, and allows nothing until the new password is valid', () => {
    expect(container.textContent).toContain('owner@acme.example');
    expect(container.textContent).toContain('Acme');
    expect(submit().disabled).toBe(true);

    fill('temporary-password', 'Temp0rary9Pass');
    fill('new-password', 'short');
    expect(container.textContent).toContain('Use at least 10 characters.');
    fill('new-password', 'Temp0rary9Pass');
    fill('confirm-password', 'Temp0rary9Pass');
    expect(container.textContent).toContain('different from your temporary one');
    expect(submit().disabled).toBe(true);

    fill('new-password', 'My-own-password-1');
    fill('confirm-password', 'My-own-password-2');
    expect(container.textContent).toContain('do not match');
    fill('confirm-password', 'My-own-password-1');
    expect(submit().disabled).toBe(false);
  });

  it('confirms only after the server accepted the change', async () => {
    completePasswordChange.mockResolvedValueOnce(undefined);
    fill('temporary-password', 'Temp0rary9Pass');
    fill('new-password', 'My-own-password-1');
    fill('confirm-password', 'My-own-password-1');
    await act(async () => submit().click());
    expect(completePasswordChange).toHaveBeenCalledWith('Temp0rary9Pass', 'My-own-password-1');
    expect(shown.map((t) => [t.kind, t.message])).toEqual([['success', 'Password changed successfully']]);
  });

  it('shows the refusal in place and claims no success', async () => {
    completePasswordChange.mockRejectedValueOnce(new Error('Current password is incorrect.'));
    fill('temporary-password', 'wrong-one');
    fill('new-password', 'My-own-password-1');
    fill('confirm-password', 'My-own-password-1');
    await act(async () => submit().click());
    expect(container.querySelector('[role=alert]')?.textContent).toBe('Current password is incorrect.');
    expect(shown).toEqual([]);
  });
});
