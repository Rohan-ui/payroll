/**
 * Mail providers members can pick from. Presets fill in the usual servers; a
 * custom server takes any values. Big providers only let an account send as
 * its own address, so for them the sender must be the sign-in address.
 */

export const MAIL_PROVIDERS = ['GMAIL', 'MICROSOFT_365', 'ZOHO', 'CUSTOM'] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];
export const MAIL_SECURITY = ['SSL', 'STARTTLS'] as const;
export type MailSecurity = (typeof MAIL_SECURITY)[number];

export interface ProviderPreset {
  label: string;
  smtp: { host: string; port: number; security: MailSecurity } | null;
  imap: { host: string; port: number; security: MailSecurity } | null;
  /** Sending as any address but the sign-in one is refused or rewritten by this provider. */
  senderMustMatchUsername: boolean;
  note: string;
}

export const PROVIDER_PRESETS: Record<MailProvider, ProviderPreset> = {
  GMAIL: {
    label: 'Gmail or Google Workspace',
    smtp: { host: 'smtp.gmail.com', port: 465, security: 'SSL' },
    imap: { host: 'imap.gmail.com', port: 993, security: 'SSL' },
    senderMustMatchUsername: true,
    note: 'Google needs an app password: turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords. Your normal password will be refused.',
  },
  MICROSOFT_365: {
    label: 'Microsoft 365 / Outlook',
    smtp: { host: 'smtp.office365.com', port: 587, security: 'STARTTLS' },
    imap: { host: 'outlook.office365.com', port: 993, security: 'SSL' },
    senderMustMatchUsername: true,
    note: 'Your Microsoft 365 administrator must allow SMTP sign-in with a password (SMTP AUTH) for your mailbox. Many organizations have turned it off; if so, the connection test will say the sign-in was refused.',
  },
  ZOHO: {
    label: 'Zoho Mail',
    smtp: { host: 'smtp.zoho.com', port: 465, security: 'SSL' },
    imap: { host: 'imap.zoho.com', port: 993, security: 'SSL' },
    senderMustMatchUsername: true,
    note: 'Accounts in India use smtp.zoho.in and imap.zoho.in. With two-factor sign-in on, use an application-specific password.',
  },
  CUSTOM: {
    label: 'Another mail server',
    smtp: null,
    imap: null,
    senderMustMatchUsername: false,
    note: 'Use the SMTP and IMAP details from your email provider. The server decides which sender addresses your account may use.',
  },
};
