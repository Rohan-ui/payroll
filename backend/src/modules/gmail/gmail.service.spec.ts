import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GmailService } from './gmail.service';
import { MailSendError, MailSenderService } from '@/modules/mail/mail-sender.service';
import { UserMailAccountsService } from '@/modules/mail/user-mail-accounts.service';
import { GmailInboxQueryDto } from './dto/gmail.dto';

describe('GmailService tenant ownership', () => {
  it('names the actual SMTP settings to fix when organization sending is required', async () => {
    const sender = { kind: 'ORGANIZATION', email: 'team@example.test' };
    const resolve = jest.fn<MailSenderService['resolve']>().mockResolvedValue(sender as Awaited<ReturnType<MailSenderService['resolve']>>);
    const sendSmtp = jest.fn<MailSenderService['sendSmtp']>().mockRejectedValue(new MailSendError('535 Authentication Failed'));
    const audit = jest.fn<AuditService['log']>();
    const service = new GmailService({} as PrismaService, new ConfigService(), { log: audit } as unknown as AuditService,
      { resolve, sendSmtp } as unknown as MailSenderService, {} as UserMailAccountsService);
    const actor = { userId: 'user-1', tenantMemberId: 'member-1' } as Parameters<GmailService['sendMessage']>[1];
    await expect(service.sendMessage('tenant-1', actor, { to: ['lead@example.test'], subject: 'Follow-up', text: 'Hello' }))
      .rejects.toThrow('This send used Organization SMTP. Update its password in Organization Settings');
    expect(resolve).toHaveBeenCalledWith('tenant-1', { userId: actor.userId, tenantMemberId: actor.tenantMemberId });
    expect(sendSmtp).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });
  it('scopes connection status by both the authenticated tenant and user', async () => {
    const query = jest.fn<(sql: unknown) => Promise<unknown[]>>().mockResolvedValue([]);
    const service = new GmailService(
      { $queryRaw: query } as unknown as PrismaService,
      new ConfigService(),
      {} as AuditService,
      {} as MailSenderService,
      { imapFor: async () => null } as unknown as UserMailAccountsService,
    );

    await service.status('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

    const sql = query.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(sql.strings.join('?')).toContain('WHERE tenant_id = ?::uuid AND user_id = ?::uuid');
    expect(sql.values).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('scopes both template rows and counts to the authenticated tenant', async () => {
    const query = jest.fn<(sql: unknown) => Promise<unknown[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    const service = new GmailService(
      { $queryRaw: query } as unknown as PrismaService,
      new ConfigService(),
      {} as AuditService,
      {} as MailSenderService,
      { imapFor: async () => null } as unknown as UserMailAccountsService,
    );

    await service.listTemplates('11111111-1111-1111-1111-111111111111', 2, 25, 'welcome');

    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql] of query.mock.calls) {
      const statement = sql as { strings: string[]; values: unknown[] };
      expect(statement.strings.join('?')).toContain('tenant_id = ?::uuid');
      expect(statement.values).toContain('11111111-1111-1111-1111-111111111111');
      expect(statement.values).toContain('%welcome%');
    }
  });

  it('uses the server-advertised Sent mailbox path', async () => {
    const service = new GmailService({} as PrismaService, new ConfigService(), {} as AuditService, {} as MailSenderService, {} as UserMailAccountsService);
    const resolver = service as unknown as {
      mailboxPath(client: { list: () => Promise<Array<{ path: string; specialUse?: string }>> }, folder: 'sent'): Promise<string>;
    };

    await expect(
      resolver.mailboxPath(
        { list: async () => [{ path: '[Gmail]/Sent Mail', specialUse: '\\Sent' }] },
        'sent',
      ),
    ).resolves.toBe('[Gmail]/Sent Mail');
  });

  it('maps validated mailbox filters to an IMAP search', () => {
    const service = new GmailService({} as PrismaService, new ConfigService(), {} as AuditService, {} as MailSenderService, {} as UserMailAccountsService);
    const resolver = service as unknown as {
      searchCriteria(query: GmailInboxQueryDto, gmail: boolean, now: Date): Record<string, unknown>;
    };
    const query = Object.assign(new GmailInboxQueryDto(), {
      from: 'sender@example.com',
      unread: true,
      hasAttachment: true,
      excludePromotions: true,
      dateRange: '7d' as const,
      sizeOperator: 'larger' as const,
      sizeMb: 2,
    });

    expect(resolver.searchCriteria(query, true, new Date('2026-09-26T00:00:00Z'))).toMatchObject({
      from: 'sender@example.com',
      seen: false,
      gmailraw: 'has:attachment -category:promotions',
      larger: 2 * 1024 * 1024,
      since: new Date('2026-09-19T00:00:00Z'),
    });
  });
});
