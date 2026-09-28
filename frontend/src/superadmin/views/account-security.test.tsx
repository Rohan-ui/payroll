import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { encode } from 'uqr';

/**
 * Setting up two-factor authentication shows the setup link as a QR code,
 * drawn in the browser (API stubbed; the view is the real one).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const URI = 'otpauth://totp/Voogyo%20HQ:admin%40voogyo.test?secret=JBSWY3DPEHPK3PXP&issuer=Voogyo%20HQ&algorithm=SHA1&digits=6&period=30';

vi.mock('../api/platform-auth.api', () => ({
  platformAuthApi: {
    getMfaStatus: async () => ({ isEnabled: false, enrolledAt: null, unusedRecoveryCodeCount: 0 }),
    listSessions: async () => [],
    beginMfaEnrollment: async () => ({ secret: 'JBSWY3DPEHPK3PXP', secretFormatted: 'JBSW Y3DP EHPK 3PXP', otpauthUri: URI }),
  },
}));

const { PlatformAccountSecurityView } = await import('./PlatformAccountSecurityView');

it('shows a scannable QR code of the setup link, with the link and secret still there', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const flush = () =>
    act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });

  await act(async () => root.render(<PlatformAccountSecurityView />));
  await flush();
  const setUp = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Set up two-factor authentication'));
  await act(async () => setUp?.click());
  await flush();

  const qr = container.querySelector('svg[role=img]') as SVGSVGElement;
  expect(qr.getAttribute('aria-label')).toBe('QR code for setting up two-factor authentication');
  // Every dark module of the encoded link is drawn, dark on a white background.
  const expected = encode(URI, { ecc: 'M', border: 4 });
  expect(qr.getAttribute('viewBox')).toBe(`0 0 ${expected.size} ${expected.size}`);
  const drawn = (qr.querySelector('path')?.getAttribute('d')?.match(/M\d+ \d+h1v1h-1z/g) ?? []).length;
  expect(drawn).toBe(expected.data.flat().filter(Boolean).length);
  expect(qr.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff');
  // Manual entry still works, and nothing was sent anywhere to draw it.
  expect(container.textContent).toContain('JBSW Y3DP EHPK 3PXP');
  expect(container.textContent).toContain(URI);
  expect(fetchSpy).not.toHaveBeenCalled();

  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
