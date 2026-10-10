import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { GmailService } from '@/modules/gmail/gmail.service';
import { leadActivity } from './sequence-context';
import { SequenceEnrollmentService } from './sequence-enrollment.service';
import { EmailSuppressionService } from './email-suppression.service';
import { idsIn, InboundMessage, isAutomatic, isDeliveryReport, normalizeId, plainAddress, readBounce, repliedTo } from './sequence-inbound';

/** How often one mailbox is read, and how far back sends are watched for answers. */
export const SCAN_EVERY_MS = 5 * 60_000;
const WATCH_DAYS = 30;
const MAX_PER_SCAN = 200;
const REPORT_BYTES = 256 * 1024;

export interface InboxState { uidValidity: number | null; lastUid: number | null; since: Date }
export interface InboxRead { mailboxEmail: string; uidValidity: number; lastUid: number | null; messages: (InboundMessage & { uid: number })[] }

/** Reads new messages from a member's inbox. Swapped for a fake in tests. */
export interface InboxReader {
  read(tenantId: string, userId: string, state: InboxState): Promise<InboxRead>;
}
export const INBOX_READER = Symbol('INBOX_READER');

/** Reads through the member's connected Gmail or own IMAP account, read-only: nothing in the mailbox is changed. */
@Injectable()
export class ImapInboxReader implements InboxReader {
  constructor(private readonly gmail: GmailService) {}

  read(tenantId: string, userId: string, state: InboxState): Promise<InboxRead> {
    return this.gmail.withMemberInbox(tenantId, userId, async (client, mailbox) => {
      const lock = await client.getMailboxLock('INBOX', { readOnly: true });
      try {
        const validity = Number(client.mailbox ? client.mailbox.uidValidity : 0);
        const continuing = state.uidValidity === validity && state.lastUid !== null;
        const found = continuing ? await client.search({ uid: `${state.lastUid! + 1}:*` }, { uid: true }) : await client.search({ since: state.since }, { uid: true });
        const uids = (found || []).filter((uid) => !continuing || uid > state.lastUid!).sort((a, b) => a - b).slice(0, MAX_PER_SCAN);
        const messages: InboxRead['messages'] = [];
        if (uids.length) {
          for await (const m of client.fetch(uids, { uid: true, envelope: true, headers: ['auto-submitted', 'x-autoreply', 'x-autorespond', 'precedence', 'content-type', 'references'] }, { uid: true })) {
            const headers = m.headers ? m.headers.toString('utf8') : '';
            const references = headers.match(/^References:[ \t]*(.*(?:\r?\n[ \t].*)*)/im)?.[1] ?? '';
            messages.push({
              uid: m.uid,
              messageId: m.envelope?.messageId ?? null,
              from: m.envelope?.from?.[0]?.address ?? null,
              subject: m.envelope?.subject ?? null,
              date: m.envelope?.date ? new Date(m.envelope.date) : new Date(),
              inReplyTo: m.envelope?.inReplyTo ?? null,
              references: idsIn(references),
              headers,
            });
          }
          // Delivery reports only: the whole message (bounded), to find which email bounced.
          for (const message of messages.filter(isDeliveryReport)) {
            const full = await client.fetchOne(String(message.uid), { source: { maxLength: REPORT_BYTES } }, { uid: true });
            message.source = full && full.source ? full.source.toString('utf8') : '';
          }
        }
        return { mailboxEmail: mailbox.email, uidValidity: validity, lastUid: uids.length ? uids[uids.length - 1] : continuing ? state.lastUid : null, messages };
      } finally {
        lock.release();
      }
    });
  }
}

/**
 * Finds replies and bounces to sequence emails in the sending mailboxes: the
 * inboxes of members whose own account sent them (their Gmail, or their IMAP
 * account). The organization account has no inbox here, so its emails' replies
 * can't be found; the editor says so. A reply stops the lead's sequence; an
 * automatic reply (out of office) doesn't; a hard bounce stops it and puts the
 * address on the do-not-email list. Each message counts once, however often
 * the mailbox is read.
 */
@Injectable()
export class SequenceInboxService {
  private readonly logger = new Logger('SequenceInbox');

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: SequenceEnrollmentService,
    private readonly suppressions: EmailSuppressionService,
    @Inject(INBOX_READER) private readonly reader: InboxReader,
  ) {}

  async scanAll(now = new Date()) {
    const since = new Date(now.getTime() - WATCH_DAYS * 86_400_000);
    const mailboxes = await this.prisma.$queryRaw<{ tenant_id: string; sender_member_id: string; first_sent: Date }[]>`
      SELECT tenant_id, sender_member_id, MIN(sent_at) AS first_sent FROM rndtechnosoft_email_sequence_sends
      WHERE sender_member_id IS NOT NULL AND send_status IN ('SENT', 'BOUNCED') AND sent_at >= ${since}
      GROUP BY tenant_id, sender_member_id`;
    let scanned = 0;
    for (const box of mailboxes) {
      if (await this.claim(box.tenant_id, box.sender_member_id, now)) {
        await this.scan(box.tenant_id, box.sender_member_id, box.first_sent, now);
        scanned += 1;
      }
    }
    return scanned;
  }

  /** Takes a mailbox's turn: at most once per SCAN_EVERY_MS, by one worker. */
  private async claim(tenantId: string, memberId: string, now: Date) {
    await this.prisma.rndtechnosoft_email_mailbox_scans.createMany({
      data: [{ id: randomUUID(), tenant_id: tenantId, member_id: memberId, mailbox_email: '' }],
      skipDuplicates: true,
    });
    const taken = await this.prisma.rndtechnosoft_email_mailbox_scans.updateMany({
      where: { tenant_id: tenantId, member_id: memberId, OR: [{ last_scanned_at: null }, { last_scanned_at: { lt: new Date(now.getTime() - SCAN_EVERY_MS) } }] },
      data: { last_scanned_at: now, updated_at: now },
    });
    return taken.count > 0;
  }

  async scan(tenantId: string, memberId: string, since: Date, now = new Date()) {
    const state = await this.prisma.rndtechnosoft_email_mailbox_scans.findFirstOrThrow({ where: { tenant_id: tenantId, member_id: memberId } });
    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({ where: { tenant_id: tenantId, id: memberId }, select: { user_id: true } });
    if (!member) return;
    try {
      const read = await this.reader.read(tenantId, member.user_id, { uidValidity: state.uid_validity === null ? null : Number(state.uid_validity), lastUid: state.last_uid, since });
      await this.process(tenantId, memberId, read.mailboxEmail, read.messages);
      await this.prisma.rndtechnosoft_email_mailbox_scans.update({
        where: { id: state.id },
        data: { mailbox_email: read.mailboxEmail, uid_validity: BigInt(read.uidValidity), last_uid: read.lastUid, last_error: null, updated_at: now },
      });
    } catch (error) {
      // Shown in the sequence so someone can reconnect the mailbox; never the server's details.
      const reason = error instanceof HttpException ? error.message : 'The mailbox could not be read; it will be tried again in a few minutes.';
      this.logger.warn(`Mailbox scan failed member=${memberId}: ${error instanceof Error ? error.name : 'unknown'}`);
      await this.prisma.rndtechnosoft_email_mailbox_scans.update({ where: { id: state.id }, data: { last_error: reason.slice(0, 500), updated_at: now } });
    }
  }

  /** Messages read from one member's mailbox, matched to the sequence emails they sent. */
  async process(tenantId: string, memberId: string, mailboxEmail: string, messages: InboundMessage[]) {
    if (!messages.length) return { replies: 0, bounces: 0 };
    const sends = await this.prisma.rndtechnosoft_email_sequence_sends.findMany({
      where: { tenant_id: tenantId, sender_member_id: memberId, message_id: { not: null }, send_status: { in: ['SENT', 'BOUNCED'] }, sent_at: { gte: new Date(Date.now() - (WATCH_DAYS + 15) * 86_400_000) } },
      select: { id: true, message_id: true, recipient_email: true, sent_at: true, send_status: true, enrollment_id: true, lead_id: true, rndtechnosoft_email_sequence_enrollments: { select: { enrollment_status: true } } },
      orderBy: { sent_at: 'desc' },
    });
    const byId = new Map(sends.map((s) => [normalizeId(s.message_id!), s]));
    const ids = new Set(byId.keys());
    let replies = 0;
    let bounces = 0;
    for (const message of messages) {
      const inboundId = (message.messageId ? normalizeId(message.messageId) : `<no-id.${message.date.getTime()}.${plainAddress(message.from)}>`).slice(0, 255);
      if (isDeliveryReport(message)) {
        const bounce = readBounce(message, ids);
        const send = bounce ? byId.get(bounce.messageId) : null;
        if (bounce && send && (await this.recordBounce(tenantId, mailboxEmail, inboundId, message, send, bounce.kind, bounce.status))) bounces += 1;
        continue;
      }
      let method: 'THREAD' | 'SENDER' = 'THREAD';
      let send = (() => { const id = repliedTo(message, ids); return id ? byId.get(id) : undefined; })();
      if (!send) {
        // A new email from the recipient's exact address (not just their domain), after we wrote, while they are in a sequence.
        method = 'SENDER';
        const from = plainAddress(message.from);
        send = sends.find((s) => s.recipient_email === from && s.sent_at! <= message.date && s.rndtechnosoft_email_sequence_enrollments.enrollment_status === 'ACTIVE');
      }
      if (send && (await this.recordReply(tenantId, mailboxEmail, inboundId, message, send, method))) replies += 1;
    }
    return { replies, bounces };
  }

  /** A reply: noted once; a person's reply stops the sequence, an automatic one doesn't. */
  private async recordReply(tenantId: string, mailboxEmail: string, inboundId: string, message: InboundMessage, send: { id: string; enrollment_id: string; lead_id: string }, method: 'THREAD' | 'SENDER') {
    const automatic = isAutomatic(message);
    return this.prisma.$transaction(async (tx) => {
      const added = await tx.rndtechnosoft_email_sequence_events.createMany({
        data: [{
          id: randomUUID(), tenant_id: tenantId, send_id: send.id, event_kind: automatic ? 'AUTO_REPLY' : 'REPLY', match_method: method, mailbox_email: mailboxEmail,
          inbound_message_id: inboundId, from_email: plainAddress(message.from).slice(0, 320) || null, subject: message.subject?.slice(0, 300) ?? null, received_at: message.date,
        }],
        skipDuplicates: true,
      });
      if (!added.count || automatic) return false;
      await tx.rndtechnosoft_email_sequence_sends.updateMany({ where: { id: send.id, replied_at: null }, data: { replied_at: message.date, updated_at: new Date() } });
      await leadActivity(tx, tenantId, send.lead_id, 'EMAIL_REPLY', `Reply received: ${message.subject ?? '(no subject)'}`,
        `From: ${message.from ?? 'unknown'}\nIn the inbox of ${mailboxEmail}.`, null, message.date);
      await this.enrollments.stop(tx, tenantId, send.enrollment_id, 'REPLIED', `Reply from ${message.from ?? 'the lead'}`, null);
      return true;
    });
  }

  /** A bounce: noted once; a hard one marks the email bounced, stops the sequence and lists the address. */
  private async recordBounce(tenantId: string, mailboxEmail: string, inboundId: string, message: InboundMessage, send: { id: string; enrollment_id: string; lead_id: string; recipient_email: string; send_status: string }, kind: 'HARD' | 'SOFT', status: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const added = await tx.rndtechnosoft_email_sequence_events.createMany({
        data: [{
          id: randomUUID(), tenant_id: tenantId, send_id: send.id, event_kind: 'BOUNCE', match_method: 'THREAD', bounce_kind: kind, mailbox_email: mailboxEmail,
          inbound_message_id: inboundId, from_email: plainAddress(message.from).slice(0, 320) || null, subject: message.subject?.slice(0, 300) ?? null,
          detail: status ? `Delivery status ${status}` : null, received_at: message.date,
        }],
        skipDuplicates: true,
      });
      if (!added.count || kind === 'SOFT') return false;
      await tx.rndtechnosoft_email_sequence_sends.updateMany({ where: { id: send.id, send_status: 'SENT' }, data: { send_status: 'BOUNCED', bounced_at: message.date, bounce_kind: 'HARD', updated_at: new Date() } });
      await leadActivity(tx, tenantId, send.lead_id, 'EMAIL_BOUNCED', `Email bounced: ${send.recipient_email}`,
        `The mail server reported the address can’t receive email${status ? ` (status ${status})` : ''}. It is on the do-not-email list now.`, null, message.date);
      await this.enrollments.stop(tx, tenantId, send.enrollment_id, 'BOUNCED', status ? `Delivery status ${status}` : null, null);
      await this.suppressions.suppress(tx, tenantId, send.recipient_email, 'BOUNCED', 'BOUNCE', { sendId: send.id });
      return true;
    });
  }
}
