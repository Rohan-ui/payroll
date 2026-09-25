import { tenantOnboardingEmail } from '@/modules/email/email-templates';

/** The onboarding email's content, for both kinds of owner, with every inserted value escaped. */
describe('Tenant onboarding email', () => {
  const base = {
    platformName: 'Voogyo',
    organizationName: 'Acme <Industries> & Co',
    ownerName: 'Asha "A" Rao',
    ownerEmail: 'owner@acme.example',
    workspaceUrl: 'https://acme.voogyo.com',
    supportEmail: 'support@voogyo.com',
  };

  it('gives a new owner everything needed for the first sign-in', () => {
    const email = tenantOnboardingEmail({ ...base, temporaryPassword: 'AbCd2345EfGh6789' });
    expect(email.subject).toBe('Welcome to Voogyo: your Acme <Industries> & Co workspace is ready');
    for (const part of [email.text, email.html]) {
      expect(part).toContain('https://acme.voogyo.com');
      expect(part).toContain('owner@acme.example');
      expect(part).toContain('AbCd2345EfGh6789');
      expect(part).toContain('support@voogyo.com');
    }
    expect(email.text).toContain('Temporary password: AbCd2345EfGh6789');
    expect(email.text).toMatch(/Choose a new password when asked .*stops working/);
    expect(email.html).toContain('>Access Your Workspace</a>');
    expect(email.html).toContain('href="https://acme.voogyo.com"');
    expect(email.html).toContain('Security notice.');
    expect(email.html).toContain('Your first sign-in');
    // Inserted values cannot break out of the markup.
    expect(email.html).toContain('Acme &lt;Industries&gt; &amp; Co');
    expect(email.html).toContain('Asha &quot;A&quot; Rao');
    expect(email.html).not.toContain('<Industries>');
    expect(email.html).not.toContain('#setup=');
  });

  it('tells an owner who already has a password to use it, and carries no password', () => {
    const email = tenantOnboardingEmail({ ...base, temporaryPassword: null, supportEmail: null });
    expect(email.text).not.toMatch(/Temporary password/);
    expect(email.html).not.toMatch(/Temporary password/);
    expect(email.text).toContain('Password: your existing Voogyo password');
    expect(email.text).toContain('Reply to this email');
    expect(email.html).toContain('>Access Your Workspace</a>');
  });
});
