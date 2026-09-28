import { createServer, Server, Socket } from 'net';

export interface CapturedMessage {
  from: string;
  to: string[];
  /** The raw message with quoted-printable soft breaks and escapes decoded. */
  body: string;
}

/**
 * A minimal SMTP server for tests: speaks enough of RFC 5321 for nodemailer
 * to deliver a message (no TLS, no AUTH), keeps what it receives, and can
 * refuse chosen recipients with a 550.
 */
export class FakeSmtpServer {
  readonly messages: CapturedMessage[] = [];
  readonly rejectedRecipients = new Set<string>();
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();

  async start(port: number): Promise<void> {
    this.server = createServer((socket) => this.session(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, '127.0.0.1', () => resolve());
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  private session(socket: Socket) {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    let buffer = '';
    let inData = false;
    let from = '';
    let to: string[] = [];
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply('220 fake.smtp ESMTP');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          const raw = buffer.slice(0, end).replace(/\r\n\.\./g, '\r\n.');
          buffer = buffer.slice(end + 5);
          inData = false;
          this.messages.push({ from, to, body: decodeQuotedPrintable(raw) });
          reply('250 2.0.0 Ok: queued');
          continue;
        }
        const newline = buffer.indexOf('\r\n');
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO') {
          reply('250-fake.smtp');
          reply('250 8BITMIME');
        } else if (command === 'HELO' || command === 'NOOP') {
          reply('250 Ok');
        } else if (command === 'MAIL') {
          from = addressIn(line);
          to = [];
          reply('250 Ok');
        } else if (command === 'RCPT') {
          const address = addressIn(line);
          if (this.rejectedRecipients.has(address)) {
            reply('550 5.1.1 No such user');
          } else {
            to.push(address);
            reply('250 Ok');
          }
        } else if (command === 'DATA') {
          inData = true;
          reply('354 End data with <CR><LF>.<CR><LF>');
        } else if (command === 'RSET') {
          from = '';
          to = [];
          reply('250 Ok');
        } else if (command === 'QUIT') {
          reply('221 Bye');
          socket.end();
        } else {
          reply('502 Command not implemented');
        }
      }
    });
  }
}

const addressIn = (line: string) => (line.match(/<([^>]*)>/)?.[1] ?? '').toLowerCase();

function decodeQuotedPrintable(raw: string): string {
  return raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
