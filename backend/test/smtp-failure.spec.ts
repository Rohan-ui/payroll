import { describeSmtpFailure } from '@/modules/email/email.service';

/** What an operator sees when the mail server says no: its reply, never the credentials. */
describe('SMTP failure reasons', () => {
  it("shows the server's authentication reply and how to fix it", () => {
    const reason = describeSmtpFailure({ code: 'EAUTH', responseCode: 535, response: '535 Authentication Failed' }, 'smtp.zoho.in', 587);
    expect(reason).toMatch(/^smtp\.zoho\.in rejected the SMTP username or password \(server replied: 535 Authentication Failed\)\./);
    expect(reason).toMatch(/full email address as the username/);
  });

  it('redacts the account name and password if the server echoes them', () => {
    const reason = describeSmtpFailure(
      { code: 'EAUTH', responseCode: 535, response: '535 auth failed for VOOGYO with s3cret-pass\r\nsecond line' },
      'smtp.example.com',
      587,
      ['VOOGYO', 's3cret-pass'],
    );
    expect(reason).toContain('535 auth failed for [redacted] with [redacted]');
    expect(reason).not.toMatch(/VOOGYO|s3cret-pass|second line/);
  });

  it('falls back to the reply code when there is no reply text', () => {
    expect(describeSmtpFailure({ code: 'EENVELOPE', responseCode: 553 }, 'smtp.zoho.in', 587)).toBe(
      'The SMTP server refused the sender or recipient address (server replied 553).',
    );
  });
});
