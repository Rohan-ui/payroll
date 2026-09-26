import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GmailService } from './gmail.service';
import { GmailInboxQueryDto } from './dto/gmail.dto';

describe('GmailService tenant ownership', () => {
  it('scopes connection status by both the authenticated tenant and user', async () => {
    const query = jest.fn<(sql: unknown) => Promise<unknown[]>>().mockResolvedValue([]);
    const service = new GmailService(
      { $queryRaw: query } as unknown as PrismaService,
      new ConfigService(),
      {} as AuditService,
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
    const service = new GmailService({} as PrismaService, new ConfigService(), {} as AuditService);
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
    const service = new GmailService({} as PrismaService, new ConfigService(), {} as AuditService);
    const resolver = service as unknown as {
      searchCriteria(query: GmailInboxQueryDto, now: Date): Record<string, unknown>;
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

    expect(resolver.searchCriteria(query, new Date('2026-09-26T00:00:00Z'))).toMatchObject({
      from: 'sender@example.com',
      seen: false,
      gmailraw: 'has:attachment -category:promotions',
      larger: 2 * 1024 * 1024,
      since: new Date('2026-09-19T00:00:00Z'),
    });
  });
});
