import { UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import * as crypto from 'crypto';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const LOG_ID = '22222222-2222-2222-2222-222222222222';
const LEAD_ID = '33333333-3333-3333-3333-333333333333';

describe('WhatsApp Webhook & Status Callback System', () => {
  let service: WhatsAppWebhookService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn().mockImplementation((cb: any) => cb(prismaMock)),
      rndtechnosoft_crm_whatsapp_configs: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      rndtechnosoft_crm_whatsapp_webhook_events: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(() => Promise.resolve({ id: 'evt-1' })),
      },
      rndtechnosoft_crm_whatsapp_logs: {
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(() => Promise.resolve({ id: LOG_ID })),
      },
      rndtechnosoft_crm_leads: {
        findFirst: jest.fn(),
      },
      rndtechnosoft_crm_lead_activities: {
        create: jest.fn().mockImplementation(() => Promise.resolve({ id: 'act-1' })),
      },
    };

    service = new WhatsAppWebhookService(prismaMock);
  });

  it('1. verifies handshake challenge when verify token matches', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findMany.mockResolvedValue([
      {
        id: 'cfg-1',
        tenant_id: TENANT_ID,
        webhook_verify_token_encrypted: 'secure_webhook_token_123',
      },
    ]);

    const challenge = await service.verifyChallenge({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'secure_webhook_token_123',
      'hub.challenge': '1158201444',
    });

    expect(challenge).toBe('1158201444');
  });

  it('2. throws UnauthorizedException when verify token is incorrect', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findMany.mockResolvedValue([
      {
        id: 'cfg-1',
        tenant_id: TENANT_ID,
        webhook_verify_token_encrypted: 'secure_webhook_token_123',
      },
    ]);

    await expect(
      service.verifyChallenge({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': '1158201444',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('3. detects duplicate event payloads via SHA-256 hash idempotency', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.findFirst.mockResolvedValue({
      id: 'existing-evt',
      payload_hash: 'somehash',
    });

    const res = await service.handleWebhookPayload({
      entry: [{ id: '123' }],
    });

    expect(res.received).toBe(true);
    expect(res.duplicate).toBe(true);
    expect(prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.create).not.toHaveBeenCalled();
  });

  it('4. processes delivery status update (DELIVERED, READ) by matching wamid', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.findFirst.mockResolvedValue(null);
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      id: 'cfg-1',
      tenant_id: TENANT_ID,
      from_phone_number_id: 'phone-100',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_logs.findFirst.mockResolvedValue({
      id: LOG_ID,
      tenant_id: TENANT_ID,
      provider_message_id: 'wamid.HBgLMTE=',
      status: 'SENT',
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-100' },
                statuses: [
                  {
                    id: 'wamid.HBgLMTE=',
                    status: 'delivered',
                    timestamp: '1700000000',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const res = await service.handleWebhookPayload(payload);
    expect(res.processed).toBe(true);
    expect(prismaMock.rndtechnosoft_crm_whatsapp_logs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id_id: { tenant_id: TENANT_ID, id: LOG_ID } },
        data: expect.objectContaining({
          status: 'DELIVERED',
        }),
      }),
    );
  });

  it('5. prevents out-of-order status downgrade (READ is never replaced by DELIVERED)', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.findFirst.mockResolvedValue(null);
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      id: 'cfg-1',
      tenant_id: TENANT_ID,
      from_phone_number_id: 'phone-100',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_logs.findFirst.mockResolvedValue({
      id: LOG_ID,
      tenant_id: TENANT_ID,
      provider_message_id: 'wamid.HBgLMTE=',
      status: 'READ', // Already read!
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-100' },
                statuses: [
                  {
                    id: 'wamid.HBgLMTE=',
                    status: 'delivered', // Out of order delayed delivered event
                    timestamp: '1700000000',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await service.handleWebhookPayload(payload);
    // Should NOT update to DELIVERED because READ has priority 4 > DELIVERED priority 3
    expect(prismaMock.rndtechnosoft_crm_whatsapp_logs.update).not.toHaveBeenCalled();
  });

  it('6. logs error message when status is FAILED', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.findFirst.mockResolvedValue(null);
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      id: 'cfg-1',
      tenant_id: TENANT_ID,
      from_phone_number_id: 'phone-100',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_logs.findFirst.mockResolvedValue({
      id: LOG_ID,
      tenant_id: TENANT_ID,
      provider_message_id: 'wamid.HBgLMTE=',
      status: 'SENT',
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-100' },
                statuses: [
                  {
                    id: 'wamid.HBgLMTE=',
                    status: 'failed',
                    errors: [{ code: 131026, title: 'Message undeliverable to recipient' }],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await service.handleWebhookPayload(payload);
    expect(prismaMock.rndtechnosoft_crm_whatsapp_logs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id_id: { tenant_id: TENANT_ID, id: LOG_ID } },
        data: expect.objectContaining({
          status: 'FAILED',
          error_message: 'Message undeliverable to recipient',
        }),
      }),
    );
  });

  it('7. processes incoming customer messages and creates timeline lead activity', async () => {
    prismaMock.rndtechnosoft_crm_webhook_events?.findFirst?.mockResolvedValue(null);
    prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.findFirst.mockResolvedValue(null);
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      id: 'cfg-1',
      tenant_id: TENANT_ID,
      from_phone_number_id: 'phone-100',
    });

    prismaMock.rndtechnosoft_crm_leads.findFirst.mockResolvedValue({
      id: LEAD_ID,
      first_name: 'John',
      last_name: 'Doe',
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-100' },
                messages: [
                  {
                    from: '919876543210',
                    id: 'wamid.INCOMING123',
                    type: 'text',
                    text: { body: 'Yes, please share the quotation.' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const res = await service.handleWebhookPayload(payload);
    expect(res.processed).toBe(true);
    expect(prismaMock.rndtechnosoft_crm_lead_activities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          lead_id: LEAD_ID,
          activity_type: 'OUTREACH_WHATSAPP_REPLY',
          description: expect.stringContaining('Yes, please share the quotation.'),
        }),
      }),
    );
  });

  it('8. rejects unauthenticated incoming webhooks when no matching tenant config exists', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.findFirst.mockResolvedValue(null);
    // Config lookup returns null for unknown phone_number_id / vendor_uid
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue(null);

    const unknownPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'unknown-hardware-id' },
                statuses: [{ id: 'wamid.UNKNOWN', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    };

    await expect(service.handleWebhookPayload(unknownPayload)).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.create).not.toHaveBeenCalled();
  });

  it('9. rejects webhook when app_secret is configured and signature header is missing or invalid', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.findFirst.mockResolvedValue(null);
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      id: 'cfg-1',
      tenant_id: TENANT_ID,
      from_phone_number_id: 'phone-100',
      app_secret_encrypted: 'super_secret_meta_app_key',
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-100' },
                statuses: [{ id: 'wamid.123', status: 'sent' }],
              },
            },
          ],
        },
      ],
    };

    // Missing signature header
    await expect(service.handleWebhookPayload(payload)).rejects.toThrow(
      'Missing X-Hub-Signature-256 header.',
    );

    // Invalid signature header
    await expect(service.handleWebhookPayload(payload, 'sha256=invalid_hex_string')).rejects.toThrow(
      'Invalid webhook signature.',
    );
  });

  it('10. accepts and verifies webhook when HMAC-SHA256 signature matches app_secret', async () => {
    const appSecret = 'super_secret_meta_app_key';
    prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.findFirst.mockResolvedValue(null);
    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      id: 'cfg-1',
      tenant_id: TENANT_ID,
      from_phone_number_id: 'phone-100',
      app_secret_encrypted: appSecret,
    });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-100' },
                statuses: [{ id: 'wamid.123', status: 'sent' }],
              },
            },
          ],
        },
      ],
    };

    const rawString = JSON.stringify(payload);
    const validSignature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawString).digest('hex');

    const res = await service.handleWebhookPayload(payload, validSignature);
    expect(res.received).toBe(true);
    expect(res.processed).toBe(true);
    expect(prismaMock.rndtechnosoft_crm_whatsapp_webhook_events.create).toHaveBeenCalled();
  });
});
