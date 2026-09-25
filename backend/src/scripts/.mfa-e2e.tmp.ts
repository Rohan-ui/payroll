import { generateTotpCode, currentTimeStep } from '../modules/super-admin/auth/totp.util';

const BASE = 'http://localhost:4100/api/v1/super-admin';
const EMAIL = 'superadmin@voogyo.com';
const PASSWORD = 'Voogyo@2026!';

async function call(path: string, options: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function check(label: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) process.exitCode = 1;
}

(async () => {
  // Sign in and enrol.
  const login = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const token: string = login.body.data.token;

  const setup = await call('/auth/mfa/setup', { method: 'POST' }, token);
  const secret: string = setup.body.data.secret;
  console.log('\n[enrolment]');
  check('setup returns a base32 secret', /^[A-Z2-7]{32}$/.test(secret));
  check('setup returns an otpauth URI', String(setup.body.data.otpauthUri).startsWith('otpauth://totp/'));

  const wrong = await call('/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code: '000000' }) }, token);
  check('wrong confirmation code refused', wrong.status === 401);

  const code = generateTotpCode(secret, currentTimeStep());
  const enable = await call('/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }, token);
  check('correct code enables MFA', enable.status === 200);
  const recoveryCodes: string[] = enable.body?.data?.recoveryCodes ?? [];
  check('10 recovery codes issued', recoveryCodes.length === 10, recoveryCodes[0]);

  // Sign in again: password alone must not be enough.
  console.log('\n[challenge]');
  const login2 = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const pending: string = login2.body.data.token;
  check('login now reports mfaRequired', login2.body.data.mfaRequired === true);

  const blocked = await call('/tenants', {}, pending);
  check('pending token cannot read tenants', blocked.status === 401, blocked.body?.message);

  const badFactor = await call('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code: '111111' }) }, pending);
  check('wrong factor refused', badFactor.status === 401);

  // Enrolment consumed the current step, so the next code is the one the
  // operator would actually type. Step+1 is inside the skew window.
  const step = currentTimeStep() + 1;
  const verified = await call('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code: generateTotpCode(secret, step) }) }, pending);
  check('correct factor completes sign-in', verified.status === 200 && verified.body.data.mfaRequired === false);

  const allowed = await call('/tenants', {}, pending);
  check('same token now reads tenants', allowed.status === 200);

  // Replay: the identical code must not work for a fresh challenge.
  console.log('\n[replay + recovery]');
  const login3 = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const pending3: string = login3.body.data.token;
  const replay = await call('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code: generateTotpCode(secret, step) }) }, pending3);
  check('used TOTP code cannot be replayed', replay.status === 401);

  const recovery = await call('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code: recoveryCodes[0] }) }, pending3);
  check('recovery code completes sign-in', recovery.status === 200);

  const login4 = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const reuse = await call('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code: recoveryCodes[0] }) }, login4.body.data.token);
  check('recovery code is single use', reuse.status === 401);

  // Clean up so the seeded account stays usable.
  console.log('\n[teardown]');
  const login5 = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const t5: string = login5.body.data.token;
  await call('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code: recoveryCodes[1] }) }, t5);
  const off = await call('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password: PASSWORD, code: recoveryCodes[2] }) }, t5);
  check('MFA disabled again', off.status === 200, off.body?.message);
})();
