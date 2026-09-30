import { apiClient } from './client';

/** Members' own mail accounts, and the workspace email policy. */

export type MailProvider = 'GMAIL' | 'MICROSOFT_365' | 'ZOHO' | 'CUSTOM';
export type MailSecurity = 'SSL' | 'STARTTLS';
export type MailStatus = 'UNTESTED' | 'CONNECTED' | 'FAILED' | 'DISCONNECTED';
export type PersonalAccountsPolicy = 'ALLOWED' | 'ORGANIZATION_ONLY';

export interface ProviderPreset {
  code: MailProvider;
  label: string;
  smtp: { host: string; port: number; security: MailSecurity } | null;
  imap: { host: string; port: number; security: MailSecurity } | null;
  senderMustMatchUsername: boolean;
  note: string;
}

export interface MailAccount {
  provider: MailProvider;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  smtpUsername: string;
  hasSmtpPassword: boolean;
  senderEmail: string;
  senderName: string | null;
  replyToEmail: string | null;
  imapEnabled: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapSecurity: MailSecurity | null;
  imapUsername: string | null;
  imapUsesSmtpPassword: boolean;
  hasImapPassword: boolean;
  enabled: boolean;
  smtpStatus: MailStatus;
  smtpLastTestedAt: string | null;
  smtpLastSuccessAt: string | null;
  smtpLastError: string | null;
  imapStatus: MailStatus;
  imapLastTestedAt: string | null;
  imapLastSuccessAt: string | null;
  imapLastError: string | null;
  updatedAt: string;
}

export interface MyMail {
  policy: { personalAccounts: PersonalAccountsPolicy };
  gmail: { connected: boolean; email: string | null };
  /** Where an email this member starts goes out from, under the current policy. */
  sendsFrom: 'PERSONAL' | 'GMAIL' | 'ORGANIZATION';
  account: MailAccount | null;
  providers: ProviderPreset[];
}

export interface MailAccountInput {
  provider: MailProvider;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  smtpUsername: string;
  smtpPassword?: string;
  senderEmail: string;
  senderName?: string;
  replyToEmail?: string;
  imapEnabled: boolean;
  imapHost?: string;
  imapPort?: number;
  imapSecurity?: MailSecurity;
  imapUsername?: string;
  imapUsesSmtpPassword?: boolean;
  imapPassword?: string;
}

export interface MailTestResult {
  ok: boolean;
  message: string;
}

export interface MemberMailStatus {
  name: string;
  loginEmail: string;
  gmail: string | null;
  account: {
    provider: MailProvider;
    senderEmail: string;
    enabled: boolean;
    smtpStatus: MailStatus;
    smtpLastSuccessAt: string | null;
    imapEnabled: boolean;
    imapStatus: MailStatus;
  } | null;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const mailApi = {
  mine: () => apiClient.get<Envelope<MyMail>>('/mail-accounts/me').then((r) => r.data),
  save: (input: MailAccountInput) => apiClient.put<Envelope<MyMail>>('/mail-accounts/me', input).then((r) => r.data),
  disconnect: () => apiClient.delete<Envelope<MyMail>>('/mail-accounts/me').then((r) => r.data),
  testSmtp: () => apiClient.post<Envelope<MailTestResult>>('/mail-accounts/me/test-smtp').then((r) => r.data),
  testImap: () => apiClient.post<Envelope<MailTestResult>>('/mail-accounts/me/test-imap').then((r) => r.data),
  sendTestEmail: (recipient: string) => apiClient.post<Envelope<MailTestResult>>('/mail-accounts/me/test-email', { recipient }).then((r) => r.data),
  members: () => apiClient.get<Envelope<MemberMailStatus[]>>('/mail-accounts/members').then((r) => r.data),
  setPolicy: (personalAccounts: PersonalAccountsPolicy) =>
    apiClient.put<Envelope<{ personalAccounts: PersonalAccountsPolicy }>>('/mail-accounts/policy', { personalAccounts }).then((r) => r.data),
};
