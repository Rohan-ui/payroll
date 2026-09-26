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
  /**
   * Present when the owner has no password of their own yet: a one-time
   * password they must replace at first sign-in. Never stored or logged.
   */
  temporaryPassword: string | null;
  supportEmail: string | null;
}

// Colours chosen for WCAG AA contrast on their backgrounds.
const INK = '#1f2937';
const MUTED = '#4b5563';
const BRAND = '#0f766e';
const LINE = '#e5e7eb';

const cell = (content: string, style = '') =>
  `<tr><td class="px" style="padding:0 40px;${style}">${content}</td></tr>`;

/** A table-based message, inline-styled so Gmail, Outlook and Apple Mail render it alike. */
const onboardingLayout = (preheader: string, rows: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(preheader)}</title>` +
  `<style>@media (max-width:620px){.px{padding-left:20px!important;padding-right:20px!important}.card{border-radius:0!important}` +
  `.lbl,.val{display:block!important;width:auto!important}.lbl{padding-bottom:0!important}}</style></head>` +
  `<body style="margin:0;padding:0;background:#f3f4f6;-webkit-text-size-adjust:100%">` +
  `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4f6">${escapeHtml(preheader)}</div>` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 0">` +
  `<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};font-size:15px;line-height:1.6">` +
  rows +
  `</table></td></tr></table></body></html>`;

// Shared pieces of the account emails (onboarding and password reset).
const headerRow = (platformName: string) =>
  `<tr><td class="px" style="background:#181724;padding:22px 40px"><span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.5px">${escapeHtml(platformName)}</span></td></tr>`;

const detail = (label: string, value: string) =>
  `<tr><td class="lbl" style="padding:6px 0;color:${MUTED};font-size:13px;width:150px;vertical-align:top">${escapeHtml(label)}</td>` +
  `<td class="val" style="padding:6px 0;font-weight:600;overflow-wrap:anywhere;word-break:break-word">${value}</td></tr>`;

const detailsCard = (rows: string) =>
  cell(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px"><tr><td style="padding:16px 20px">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`,
    'padding-bottom:28px',
  );

const passwordBadge = (password: string) =>
  `<span style="display:inline-block;white-space:nowrap;padding:6px 10px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:6px;color:#134e4a;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:16px;letter-spacing:1px">${escapeHtml(password)}</span>`;

const buttonRow = (url: string, label: string) =>
  cell(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${BRAND}" style="border-radius:8px">` +
      `<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>` +
      `</td></tr></table>` +
      `<p style="margin:12px 0 0;color:${MUTED};font-size:13px">Or copy this address into your browser: <span style="word-break:break-all">${escapeHtml(url)}</span></p>`,
    'padding-bottom:28px',
  );

const stepsRow = (heading: string, steps: string[]) =>
  cell(
    `<h2 style="margin:0 0 10px;font-size:16px;color:${INK}">${escapeHtml(heading)}</h2>` +
      `<ol style="margin:0;padding-left:20px">${steps.map((step) => `<li style="margin:0 0 6px">${escapeHtml(step)}</li>`).join('')}</ol>`,
    'padding-bottom:24px',
  );

const securityRow = (text: string) =>
  cell(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 18px;color:#78350f;font-size:14px">` +
      `<strong>Security notice.</strong> ${escapeHtml(text)}</td></tr></table>`,
    'padding-bottom:24px',
  );

const closingRows = (support: string, footer: string, platformName: string) =>
  cell(`<p style="margin:0;color:${MUTED};font-size:14px">${escapeHtml(support)}</p>`, 'padding-bottom:32px') +
  `<tr><td class="px" style="padding:20px 40px;border-top:1px solid ${LINE};background:#f9fafb;color:${MUTED};font-size:12px;line-height:1.5">` +
  `${escapeHtml(footer)}<br>&copy; ${new Date().getUTCFullYear()} ${escapeHtml(platformName)}</td></tr>`;

const supportLine = (platformName: string, supportEmail: string | null) =>
  supportEmail
    ? `Need help? Contact ${platformName} support at ${supportEmail}.`
    : `Need help? Reply to this email and ${platformName} support will get back to you.`;

export function tenantOnboardingEmail(content: TenantOnboardingContent): RenderedEmail {
  const { platformName, organizationName, ownerEmail, workspaceUrl, temporaryPassword, supportEmail } = content;
  const greeting = content.ownerName ? `Hello ${content.ownerName},` : 'Hello,';
  const intro = `Your organization, ${organizationName}, now has its own ${platformName} workspace. You are its owner and administrator.`;
  const support = supportLine(platformName, supportEmail);
  const steps = temporaryPassword
    ? [
        'Open your workspace with the button above.',
        `Sign in with your email address, ${ownerEmail}, and the temporary password.`,
        'Choose a new password when asked (at least 10 characters). The temporary password stops working as soon as you do.',
        'Complete your organization setup: people, modules and roles.',
      ]
    : [
        'Open your workspace with the button above.',
        `Sign in with your email address, ${ownerEmail}, and your existing ${platformName} password.`,
        'Complete your organization setup: people, modules and roles.',
      ];
  const security = temporaryPassword
    ? `Keep this email private: the temporary password gives access to your account until you change it. ${platformName} will never ask for your password by email or phone. If you did not expect this email, do not sign in and contact support.`
    : `${platformName} will never ask for your password by email or phone. If you did not expect this email, contact support.`;
  const footer = `You received this email because a ${platformName} workspace was created for ${organizationName} with this address. This is an automated message about your account.`;

  const subject = `Welcome to ${platformName}: your ${organizationName} workspace is ready`;

  const text = [
    greeting,
    '',
    intro,
    '',
    `Organization: ${organizationName}`,
    `Workspace: ${workspaceUrl}`,
    `Username: ${ownerEmail}`,
    temporaryPassword ? `Temporary password: ${temporaryPassword}` : `Password: your existing ${platformName} password`,
    '',
    'First sign-in',
    ...steps.map((step, index) => `${index + 1}. ${step.replace('with the button above', `at ${workspaceUrl}`)}`),
    '',
    'Security',
    security,
    '',
    support,
    '',
    '--',
    footer,
  ].join('\n');

  const html = onboardingLayout(
    `Your ${organizationName} workspace on ${platformName} is ready.`,
    headerRow(platformName) +
      cell(
        `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">Welcome to ${escapeHtml(platformName)}</h1>` +
          `<p style="margin:0 0 12px">${escapeHtml(greeting)}</p><p style="margin:0">${escapeHtml(intro)}</p>`,
        'padding-top:32px;padding-bottom:24px',
      ) +
      detailsCard(
        detail('Organization', escapeHtml(organizationName)) +
          detail('Workspace URL', `<a href="${escapeHtml(workspaceUrl)}" style="color:${BRAND}">${escapeHtml(workspaceUrl)}</a>`) +
          detail('Username', escapeHtml(ownerEmail)) +
          (temporaryPassword
            ? detail('Temporary password', passwordBadge(temporaryPassword))
            : detail('Password', `Your existing ${escapeHtml(platformName)} password`)),
      ) +
      buttonRow(workspaceUrl, 'Access Your Workspace') +
      stepsRow('Your first sign-in', steps) +
      securityRow(security) +
      closingRows(support, footer, platformName),
  );

  return { subject, text, html };
}

export interface PasswordResetContent {
  platformName: string;
  userName: string | null;
  email: string;
  /** The workspaces the account can sign in to; the first is linked from the button. */
  workspaces: { name: string; url: string }[];
  /** Never stored or logged: it exists only to be put in this email. */
  temporaryPassword: string;
  supportEmail: string | null;
}

/** A platform administrator reset the account's password: a new temporary one, to be replaced at sign-in. */
export function passwordResetEmail(content: PasswordResetContent): RenderedEmail {
  const { platformName, email, workspaces, temporaryPassword } = content;
  const greeting = content.userName ? `Hello ${content.userName},` : 'Hello,';
  const intro = `A ${platformName} administrator reset the password of your account. Your previous password no longer works, and you have been signed out everywhere.`;
  const steps = [
    `Open your workspace${workspaces.length > 1 ? ' (any of those listed above)' : ''}.`,
    `Sign in with your email address, ${email}, and the temporary password.`,
    'Choose a new password when asked (at least 10 characters). The temporary password stops working as soon as you do.',
  ];
  const security = `Keep this email private: the temporary password gives access to your account until you change it. ${platformName} will never ask for your password by email or phone. If you did not expect this reset, contact support.`;
  const support = supportLine(platformName, content.supportEmail);
  const footer = `You received this email because the password of your ${platformName} account was reset. This is an automated message about your account.`;
  const subject = `Your ${platformName} password was reset`;

  const text = [
    greeting,
    '',
    intro,
    '',
    ...workspaces.map((w) => `Workspace: ${w.name}: ${w.url}`),
    `Username: ${email}`,
    `Temporary password: ${temporaryPassword}`,
    '',
    'Signing in',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Security',
    security,
    '',
    support,
    '',
    '--',
    footer,
  ].join('\n');

  const html = onboardingLayout(
    `Your ${platformName} password was reset. Sign in with the temporary password inside.`,
    headerRow(platformName) +
      cell(
        `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">Your password was reset</h1>` +
          `<p style="margin:0 0 12px">${escapeHtml(greeting)}</p><p style="margin:0">${escapeHtml(intro)}</p>`,
        'padding-top:32px;padding-bottom:24px',
      ) +
      detailsCard(
        workspaces
          .map((w) => detail('Workspace', `${escapeHtml(w.name)}<br><a href="${escapeHtml(w.url)}" style="color:${BRAND};font-weight:400">${escapeHtml(w.url)}</a>`))
          .join('') +
          detail('Username', escapeHtml(email)) +
          detail('Temporary password', passwordBadge(temporaryPassword)),
      ) +
      buttonRow(workspaces[0].url, 'Sign In to Your Workspace') +
      stepsRow('Signing in', steps) +
      securityRow(security) +
      closingRows(support, footer, platformName),
  );

  return { subject, text, html };
}

export function smtpTestEmail(platformName: string, sentAt: Date): RenderedEmail {
  const when = sentAt.toUTCString().replace(' GMT', ' UTC');
  const subject = `${platformName} SMTP test`;
  const line = `This is a test message from ${platformName} HQ, sent ${when}. If you received it, outgoing email is working.`;
  return { subject, text: line, html: layout(subject, paragraph(line)) };
}
