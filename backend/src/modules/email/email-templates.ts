/** Platform email content. Every inserted value is escaped for the HTML part. */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const paragraph = (value: string) => `<p style="margin:0 0 14px">${escapeHtml(value)}</p>`;

const layout = (title: string, body: string) =>
  `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:14px;line-height:1.55">` +
  `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e5ee;border-radius:12px;padding:28px">` +
  `<h1 style="font-size:18px;margin:0 0 18px">${escapeHtml(title)}</h1>${body}</div></body></html>`;

export interface TenantOnboardingContent {
  platformName: string;
  organizationName: string;
  ownerName: string | null;
  ownerEmail: string;
  workspaceUrl: string;
  /** Present when the owner has no password yet: a one-time link to set one. */
  setupUrl: string | null;
  setupExpiresAt: Date | null;
  supportEmail: string | null;
}

export function tenantOnboardingEmail(content: TenantOnboardingContent): RenderedEmail {
  const { platformName, organizationName, ownerEmail, workspaceUrl, setupUrl, supportEmail } = content;
  const greeting = content.ownerName ? `Hello ${content.ownerName},` : 'Hello,';
  const expires = content.setupExpiresAt
    ? content.setupExpiresAt.toUTCString().replace(' GMT', ' UTC')
    : null;

  const nextSteps = setupUrl
    ? [
        `Set your password using this link: ${setupUrl}`,
        `The link works once${expires ? ` and expires on ${expires}` : ''}. If it expires, ask ${platformName} support to send a new one.`,
        `Then sign in at ${workspaceUrl} with ${ownerEmail} and complete your organization setup.`,
      ]
    : [
        `Sign in at ${workspaceUrl} with ${ownerEmail} and your existing ${platformName} password.`,
        'Then complete your organization setup: people, modules and roles.',
      ];

  const security = [
    `${platformName} will never ask for your password by email or phone.`,
    setupUrl ? 'Do not forward this email: the setup link gives access to your account.' : null,
    'If you did not expect this email, you can ignore it and contact support.',
  ].filter((line): line is string => line !== null);

  const subject = `Welcome to ${platformName} — Your workspace is being onboarded`;

  const text = [
    greeting,
    '',
    `Your organization, ${organizationName}, has been onboarded on ${platformName}.`,
    '',
    `Your workspace: ${workspaceUrl}`,
    `Your account: ${ownerEmail}`,
    `Status: your workspace is ready for setup.`,
    '',
    'What happens next',
    ...nextSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Security',
    ...security.map((line) => `- ${line}`),
    ...(supportEmail ? ['', `Questions? Contact ${supportEmail}.`] : []),
  ].join('\n');

  const html = layout(
    `Welcome to ${platformName}`,
    paragraph(greeting) +
      paragraph(`Your organization, ${organizationName}, has been onboarded on ${platformName}. Your workspace is ready for setup.`) +
      `<table style="border-collapse:collapse;margin:0 0 18px">` +
      `<tr><td style="padding:4px 16px 4px 0;color:#475569">Workspace</td><td><a href="${escapeHtml(workspaceUrl)}">${escapeHtml(workspaceUrl)}</a></td></tr>` +
      `<tr><td style="padding:4px 16px 4px 0;color:#475569">Account</td><td>${escapeHtml(ownerEmail)}</td></tr>` +
      `</table>` +
      (setupUrl
        ? `<p style="margin:0 0 18px"><a href="${escapeHtml(setupUrl)}" style="display:inline-block;background:#4663c4;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Set your password</a></p>`
        : '') +
      `<h2 style="font-size:15px;margin:0 0 8px">What happens next</h2>` +
      `<ol style="margin:0 0 18px;padding-left:20px">${nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` +
      `<h2 style="font-size:15px;margin:0 0 8px">Security</h2>` +
      `<ul style="margin:0 0 18px;padding-left:20px">${security.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` +
      (supportEmail ? paragraph(`Questions? Contact ${supportEmail}.`) : ''),
  );

  return { subject, text, html };
}

export function smtpTestEmail(platformName: string, sentAt: Date): RenderedEmail {
  const when = sentAt.toUTCString().replace(' GMT', ' UTC');
  const subject = `${platformName} SMTP test`;
  const line = `This is a test message from ${platformName} HQ, sent ${when}. If you received it, outgoing email is working.`;
  return { subject, text: line, html: layout(subject, paragraph(line)) };
}
