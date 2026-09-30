import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

/** What an SMTP connection needs. Only server-side senders ever hold the password. */
export interface SmtpCredentials {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  security: 'SSL' | 'STARTTLS' | 'NONE';
}

export interface ImapCredentials {
  host: string;
  port: number;
  security: 'SSL' | 'STARTTLS';
  username: string;
  password: string;
}

/** An SMTP connection for one send or one test. */
export function transportFor(smtp: SmtpCredentials, timeouts = { connection: 10_000, greeting: 8_000, socket: 20_000 }) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.security === 'SSL',
    requireTLS: smtp.security === 'STARTTLS',
    ignoreTLS: smtp.security === 'NONE',
    auth: smtp.username && smtp.password ? { user: smtp.username, pass: smtp.password } : undefined,
    connectionTimeout: timeouts.connection,
    greetingTimeout: timeouts.greeting,
    socketTimeout: timeouts.socket,
  });
}

/** An IMAP connection to a member's own server. */
export function imapClient(imap: ImapCredentials, options: { verifyOnly?: boolean; maxBytes?: number } = {}) {
  return new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.security === 'SSL',
    doSTARTTLS: imap.security === 'STARTTLS' ? true : undefined,
    auth: { user: imap.username, pass: imap.password },
    verifyOnly: options.verifyOnly,
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    ...(options.maxBytes ? { maxLiteralSize: options.maxBytes + 1024 * 1024 } : {}),
    tls: { rejectUnauthorized: true },
  });
}
