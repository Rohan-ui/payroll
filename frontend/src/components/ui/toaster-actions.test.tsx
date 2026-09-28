import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { toast } from '../../lib/toast';
import { Toaster } from './Toaster';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('runs a toast action and dismisses the toast; plain toasts have no action buttons', () => {
  toast.reset();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Toaster />));

  const open = vi.fn();
  act(() => {
    toast.success('Plain message');
    toast.success('Lead LD-1 created in Sales › New', { actions: [{ label: 'Open lead', onClick: open }] });
  });
  const [plain, withAction] = [...container.querySelectorAll('[role=status]')];
  expect(plain.querySelectorAll('button')).toHaveLength(1); // dismiss only
  const action = [...withAction.querySelectorAll('button')].find((b) => b.textContent === 'Open lead') as HTMLButtonElement;
  act(() => action.click());

  expect(open).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain('Lead LD-1 created');
  expect(container.textContent).toContain('Plain message');
  act(() => root.unmount());
  container.remove();
});
