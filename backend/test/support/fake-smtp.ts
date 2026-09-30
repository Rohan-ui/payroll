import * as net from 'net';
import * as tls from 'tls';
import { readFileSync } from 'fs';
import * as path from 'path';

export interface CapturedMail {
  from: string;
  to: string[];
  /** The raw message, with quoted-printable soft breaks and escapes decoded. */
  data: string;
  /** The account that signed in to send it, when the server requires sign-in. */
  authUser: string | null;
}

export interface FakeSmtpOptions {
  /** Implicit TLS (like port 465) with the test-only certificate in ./tls. */
  tls?: boolean;
  /** Accounts that may sign in (username → password). Given, sending requires sign-in. */
  accounts?: Record<string, string>;
}

const decodeQuotedPrintable = (text: string) =>
  text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
const b64 = (text: string) => Buffer.from(text, 'base64').toString('utf8');

/** The test-only certificate and key for 127.0.0.1; trusted in tests through NODE_EXTRA_CA_CERTS. */
export const TEST_TLS = {
  key: readFileSync(path.join(process.cwd(), 'test', 'support', 'tls', 'localhost.key')),
  cert: readFileSync(path.join(process.cwd(), 'test', 'support', 'tls', 'localhost.crt')),
};

/**
 * A minimal SMTP server on 127.0.0.1 that accepts every message and keeps it
 * in memory, so tests can send real email through nodemailer without any of
 * it leaving the machine. Optionally over TLS, and requiring sign-in.
 */
export async function startFakeSmtp(options: FakeSmtpOptions = {}) {
  const messages: CapturedMail[] = [];
  const logins: { user: string; ok: boolean }[] = [];
  const handle = (socket: net.Socket) => {
    let buffer = '';
    let inData = false;
    let authUser: string | null = null;
    let authStep: 'user' | 'pass' | null = null;
    let pendingUser = '';
    let current: CapturedMail = { from: '', to: [], data: '', authUser: null };
    const signIn = (user: string, pass: string) => {
      const ok = options.accounts?.[user] === pass;
      logins.push({ user, ok });
      if (ok) authUser = user;
      socket.write(ok ? '235 2.7.0 Authentication successful\r\n' : '535 5.7.8 Authentication failed: bad credentials\r\n');
    };
    socket.write('220 fake-smtp ready\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          current.data = decodeQuotedPrintable(buffer.slice(0, end));
          current.authUser = authUser;
          buffer = buffer.slice(end + 5);
          messages.push(current);
          current = { from: '', to: [], data: '', authUser: null };
          inData = false;
          socket.write('250 queued\r\n');
          continue;
        }
        const newline = buffer.indexOf('\r\n');
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        if (authStep === 'user') {
          pendingUser = b64(line);
          authStep = 'pass';
          socket.write('334 UGFzc3dvcmQ6\r\n');
          continue;
        }
        if (authStep === 'pass') {
          authStep = null;
          signIn(pendingUser, b64(line));
          continue;
        }
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO' || command === 'HELO') socket.write(`250-fake-smtp\r\n${options.accounts ? '250-AUTH PLAIN LOGIN\r\n' : ''}250 8BITMIME\r\n`);
        else if (command === 'AUTH') {
          const [, method, initial] = line.split(' ');
          if (method?.toUpperCase() === 'PLAIN' && initial) {
            const [, user, pass] = b64(initial).split('\u0000');
            signIn(user, pass);
          } else if (method?.toUpperCase() === 'LOGIN') {
            authStep = 'user';
            socket.write('334 VXNlcm5hbWU6\r\n');
          } else socket.write('504 unsupported\r\n');
        } else if (command === 'MAIL') {
          if (options.accounts && !authUser) socket.write('530 5.7.0 Authentication required\r\n');
          else {
            current.from = line;
            socket.write('250 ok\r\n');
          }
        } else if (command === 'RCPT') { current.to.push(line.replace(/^RCPT TO:\s*<?|>?\s*$/gi, '')); socket.write('250 ok\r\n'); }
        else if (command === 'DATA') { inData = true; socket.write('354 go ahead\r\n'); }
        else if (command === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
        else socket.write('250 ok\r\n');
      }
    });
    socket.on('error', () => undefined);
  };
  const server = options.tls ? tls.createServer(TEST_TLS, handle) : net.createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    host: '127.0.0.1',
    port,
    messages,
    logins,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * A minimal IMAP server over TLS on 127.0.0.1 that accepts a sign-in for the
 * given accounts and nothing else: enough for a connection test.
 */
export async function startFakeImap(accounts: Record<string, string>) {
  const logins: { user: string; ok: boolean }[] = [];
  const unquote = (value: string) => value.replace(/^"(.*)"$/, '$1').replace(/\\(["\\])/g, '$1');
  const server = tls.createServer(TEST_TLS, (socket) => {
    let buffer = '';
    socket.write('* OK [CAPABILITY IMAP4rev1] fake-imap ready\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        const newline = buffer.indexOf('\r\n');
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const [tag, rawCommand, ...rest] = line.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? [];
        const command = rawCommand?.toUpperCase();
        if (command === 'CAPABILITY') socket.write(`* CAPABILITY IMAP4rev1\r\n${tag} OK done\r\n`);
        else if (command === 'LOGIN') {
          const user = unquote(rest[0] ?? '');
          const ok = accounts[user] === unquote(rest[1] ?? '');
          logins.push({ user, ok });
          socket.write(ok ? `${tag} OK [CAPABILITY IMAP4rev1] signed in\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        } else if (command === 'LOGOUT') {
          socket.write(`* BYE bye\r\n${tag} OK done\r\n`);
          socket.end();
        } else socket.write(`${tag} OK done\r\n`);
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    host: '127.0.0.1',
    port: (server.address() as net.AddressInfo).port,
    logins,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
