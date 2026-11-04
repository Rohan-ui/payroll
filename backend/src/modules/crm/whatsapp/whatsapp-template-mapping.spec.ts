import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { WhatsAppVariableResolverService } from './whatsapp-variable-resolver.service';
import { WhatsAppPayloadBuilderService } from './whatsapp-payload-builder.service';
import { WhatsAppProviderService } from './whatsapp-provider.service';
import { WhatsAppTemplateMappingService } from './whatsapp-template-mapping.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEMPLATE_ID = '22222222-2222-2222-2222-222222222222';
const MAPPING_ID = '33333333-3333-3333-3333-333333333333';
const LEAD_ID = '44444444-4444-4444-4444-444444444444';

describe('WhatsApp Template Mapping & Dynamic Messaging System', () => {
  let prismaMock: any;
  let resolver: WhatsAppVariableResolverService;
  let builder: WhatsAppPayloadBuilderService;
  let provider: WhatsAppProviderService;
  let mappingService: WhatsAppTemplateMappingService;
  let messagingService: WhatsAppMessagingService;

  beforeEach(() => {
    prismaMock = {
      rndtechnosoft_crm_message_templates: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      rndtechnosoft_crm_whatsapp_mappings: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      rndtechnosoft_crm_whatsapp_configs: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      rndtechnosoft_crm_whatsapp_logs: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      rndtechnosoft_crm_leads: {
        findFirst: jest.fn(),
      },
      rndtechnosoft_crm_clients: {
        findFirst: jest.fn(),
      },
      rndtechnosoft_crm_lead_activities: {
        create: jest.fn(),
      },
    };

    resolver = new WhatsAppVariableResolverService(prismaMock);
    builder = new WhatsAppPayloadBuilderService();
    provider = new WhatsAppProviderService();
    mappingService = new WhatsAppTemplateMappingService(prismaMock, resolver, builder);
    messagingService = new WhatsAppMessagingService(prismaMock, mappingService, resolver, builder, provider);
  });

  // -------------------------------------------------------------
  // Test 1: Create mapping
  // -------------------------------------------------------------
  it('1. creates a new WhatsApp template mapping for a CRM template', async () => {
    prismaMock.rndtechnosoft_crm_message_templates.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      tenant_id: TENANT_ID,
      template_name: 'Order Dispatch',
      template_code: 'crm_order_dispatch',
      message_body: 'Hello {{customer_name}}, your order {{order_id}} has dispatched.',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_mappings.findFirst.mockResolvedValue(null);
    prismaMock.rndtechnosoft_crm_whatsapp_mappings.create.mockImplementation((args: any) => ({
      ...args.data,
      rndtechnosoft_crm_message_templates: { template_name: 'Order Dispatch' },
    }));

    const result = await mappingService.saveMapping(TENANT_ID, {
      crm_template_id: TEMPLATE_ID,
      whatsapp_template_name: 'order_dispatch',
      whatsapp_template_language: 'en',
      body_mapping: {
        field_1: 'customer_name',
        field_2: 'order_id',
      },
      header_mapping: { header_field_1: 'customer_name' },
      media_type: 'NONE',
    });

    expect(result.whatsapp_template_name).toBe('order_dispatch');
    expect(result.body_mapping).toEqual({ field_1: 'customer_name', field_2: 'order_id' });
    expect(prismaMock.rndtechnosoft_crm_whatsapp_mappings.create).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------
  // Test 2: Update mapping
  // -------------------------------------------------------------
  it('2. updates an existing template mapping', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_mappings.findFirst.mockResolvedValue({
      id: MAPPING_ID,
      tenant_id: TENANT_ID,
      crm_template_id: TEMPLATE_ID,
      whatsapp_template_name: 'order_dispatch',
      is_active: true,
    });

    prismaMock.rndtechnosoft_crm_whatsapp_mappings.update.mockResolvedValue({
      id: MAPPING_ID,
      tenant_id: TENANT_ID,
      crm_template_id: TEMPLATE_ID,
      whatsapp_template_name: 'order_dispatch_v2',
      is_active: true,
      body_mapping: { field_1: 'customer_name', field_2: 'order_id', field_3: 'vehicle_number' },
    });

    const updated = await mappingService.updateMapping(TENANT_ID, MAPPING_ID, {
      whatsapp_template_name: 'order_dispatch_v2',
      body_mapping: { field_1: 'customer_name', field_2: 'order_id', field_3: 'vehicle_number' },
    });

    expect(updated.whatsapp_template_name).toBe('order_dispatch_v2');
    expect(prismaMock.rndtechnosoft_crm_whatsapp_mappings.update).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------
  // Test 3: Retrieve mapping
  // -------------------------------------------------------------
  it('3. retrieves mapping by CRM template ID or code', async () => {
    prismaMock.rndtechnosoft_crm_message_templates.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      template_code: 'crm_order_dispatch',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_mappings.findFirst.mockResolvedValue({
      id: MAPPING_ID,
      tenant_id: TENANT_ID,
      crm_template_id: TEMPLATE_ID,
      whatsapp_template_name: 'order_dispatch',
      body_mapping: { field_1: 'customer_name' },
      is_active: true,
    });

    const mapping = await mappingService.getMappingByCrmTemplate(TENANT_ID, 'crm_order_dispatch');
    expect(mapping).toBeDefined();
    expect(mapping?.whatsapp_template_name).toBe('order_dispatch');
  });

  // -------------------------------------------------------------
  // Test 4: Delete or disable mapping
  // -------------------------------------------------------------
  it('4. deletes or disables a mapping', async () => {
    prismaMock.rndtechnosoft_crm_whatsapp_mappings.findFirst.mockResolvedValue({
      id: MAPPING_ID,
      tenant_id: TENANT_ID,
    });
    prismaMock.rndtechnosoft_crm_whatsapp_mappings.delete.mockResolvedValue({ id: MAPPING_ID });

    const del = await mappingService.deleteMapping(TENANT_ID, MAPPING_ID);
    expect(del.success).toBe(true);
    expect(prismaMock.rndtechnosoft_crm_whatsapp_mappings.delete).toHaveBeenCalledTimes(1);

    // Test disabling
    prismaMock.rndtechnosoft_crm_whatsapp_mappings.update.mockResolvedValue({
      id: MAPPING_ID,
      is_active: false,
    });
    const disabled = await mappingService.updateMapping(TENANT_ID, MAPPING_ID, { is_active: false });
    expect(disabled.is_active).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 5: Send using a mapped template
  // -------------------------------------------------------------
  it('5. sends message using a mapped template automatically', async () => {
    prismaMock.rndtechnosoft_crm_message_templates.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      tenant_id: TENANT_ID,
      template_name: 'Order Dispatch',
      template_code: 'crm_order_dispatch',
      message_body: 'Hello {{customer_name}}, order {{order_id}} dispatched.',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_mappings.findFirst.mockResolvedValue({
      id: MAPPING_ID,
      tenant_id: TENANT_ID,
      crm_template_id: TEMPLATE_ID,
      whatsapp_template_name: 'order_dispatch',
      whatsapp_template_language: 'en',
      body_mapping: {
        field_1: 'customer_name',
        field_2: 'order_id',
      },
      is_active: true,
    });

    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      api_base_url: 'https://api.test-hub.com',
      vendor_uid: 'vendor_123',
      bearer_token_encrypted: 'test_token',
      from_phone_number_id: 'phone_id_999',
    });

    jest.spyOn(provider, 'sendTemplateMessage').mockResolvedValue({
      success: true,
      messageId: 'wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSQkUxODQ2QkU5QTc3QkQ5NzZCAA==',
      rawResponse: { status: 'success' },
    });

    const sendRes = await messagingService.sendMappedTemplateMessage(TENANT_ID, {
      template_id: 'crm_order_dispatch',
      recipient: '919876543210',
      variables: {
        customer_name: 'Rohan',
        order_id: 'ORD-10025',
      },
    });

    expect(sendRes.success).toBe(true);
    expect(sendRes.status).toBe('SENT');
    expect(sendRes.messageId).toContain('wamid.');
    expect(sendRes.payloadSent.field_1).toBe('Rohan');
    expect(sendRes.payloadSent.field_2).toBe('ORD-10025');
    expect(sendRes.payloadSent.phone_number).toBe('919876543210');
  });

  // -------------------------------------------------------------
  // Test 6: Send with dynamic variables resolved from Lead
  // -------------------------------------------------------------
  it('6. resolves variables dynamically from Lead record if not provided explicitly', async () => {
    prismaMock.rndtechnosoft_crm_message_templates.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      tenant_id: TENANT_ID,
      template_name: 'Lead Welcome',
      template_code: 'crm_lead_welcome',
      message_body: 'Hi {{first_name}}, welcome to {{company_name}}!',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_mappings.findFirst.mockResolvedValue({
      id: MAPPING_ID,
      tenant_id: TENANT_ID,
      crm_template_id: TEMPLATE_ID,
      whatsapp_template_name: 'lead_welcome_v1',
      whatsapp_template_language: 'en',
      body_mapping: {
        field_1: 'first_name',
        field_2: 'company_name',
      },
      is_active: true,
    });

    prismaMock.rndtechnosoft_crm_leads.findFirst.mockResolvedValue({
      id: LEAD_ID,
      tenant_id: TENANT_ID,
      first_name: 'Vikram',
      company_name: 'Acme Textiles',
      phone: '9825012345',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      vendor_uid: 'vendor_123',
      bearer_token_encrypted: 'test_token',
    });

    jest.spyOn(provider, 'sendTemplateMessage').mockResolvedValue({
      success: true,
      messageId: 'wamid.TEST_LEAD_123',
      rawResponse: { status: 'sent' },
    });

    const sendRes = await messagingService.sendMappedTemplateMessage(TENANT_ID, {
      template_id: 'crm_lead_welcome',
      recipient: '9825012345',
      lead_id: LEAD_ID,
    });

    expect(sendRes.success).toBe(true);
    expect(sendRes.payloadSent.field_1).toBe('Vikram');
    expect(sendRes.payloadSent.field_2).toBe('Acme Textiles');
  });

  // -------------------------------------------------------------
  // Test 7: Missing variable validation
  // -------------------------------------------------------------
  it('7. tracks missing variables gracefully without failing silently', async () => {
    prismaMock.rndtechnosoft_crm_message_templates.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      tenant_id: TENANT_ID,
      template_name: 'Order Dispatch',
      template_code: 'crm_order_dispatch',
      message_body: 'Hello {{customer_name}}, order {{order_id}} with vehicle {{vehicle_number}}.',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_mappings.findFirst.mockResolvedValue({
      id: MAPPING_ID,
      tenant_id: TENANT_ID,
      crm_template_id: TEMPLATE_ID,
      whatsapp_template_name: 'order_dispatch',
      whatsapp_template_language: 'en',
      body_mapping: {
        field_1: 'customer_name',
        field_2: 'order_id',
        field_3: 'vehicle_number',
      },
      is_active: true,
    });

    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      vendor_uid: 'vendor_123',
      bearer_token_encrypted: 'token',
    });

    jest.spyOn(provider, 'sendTemplateMessage').mockResolvedValue({
      success: true,
      messageId: 'wamid.MISSING_VAR_TEST',
      rawResponse: {},
    });

    // Provide customer_name and order_id, but omit vehicle_number
    const sendRes = await messagingService.sendMappedTemplateMessage(TENANT_ID, {
      template_id: 'crm_order_dispatch',
      recipient: '919876543210',
      variables: {
        customer_name: 'Rohan',
        order_id: 'ORD-10025',
      },
    });

    expect(sendRes.success).toBe(true);
    expect(sendRes.missingVariables).toContain('vehicle_number');
    expect(sendRes.payloadSent.field_3).toBe('');
  });

  // -------------------------------------------------------------
  // Test 8: Dynamic header image & media support
  // -------------------------------------------------------------
  it('8. supports dynamic header image and document mapping', async () => {
    const payload = builder.buildPayload({
      mapping: {
        whatsapp_template_name: 'invoice_ready',
        whatsapp_template_language: 'en',
        media_type: 'IMAGE',
        media_mapping: {
          header_image: '{{invoice_image_url}}',
        },
        body_mapping: {
          field_1: 'client_name',
        },
      },
      resolvedVariables: {
        client_name: 'Sharma Corp',
        invoice_image_url: 'https://example.com/invoices/INV-101.jpg',
      },
      recipientPhone: '919876543210',
    });

    expect(payload.header_image).toBe('https://example.com/invoices/INV-101.jpg');
    expect(payload.field_1).toBe('Sharma Corp');
  });

  // -------------------------------------------------------------
  // Test 9: Dynamic button values (button_0, button_1, copy_code)
  // -------------------------------------------------------------
  it('9. supports dynamic button values and copy code mapping', async () => {
    const payload = builder.buildPayload({
      mapping: {
        whatsapp_template_name: 'special_offer',
        whatsapp_template_language: 'en',
        button_mapping: {
          button_0: '{{portal_url}}',
          button_1: '{{support_phone}}',
          copy_code: '{{promo_code}}',
        },
        body_mapping: {
          field_1: 'user_name',
        },
      },
      resolvedVariables: {
        user_name: 'Priya',
        portal_url: 'https://portal.voogyo.com/claim',
        support_phone: '+919825000000',
        promo_code: 'FESTIVE50',
      },
      recipientPhone: '919876543210',
    });

    expect(payload.button_0).toBe('https://portal.voogyo.com/claim');
    expect(payload.button_1).toBe('+919825000000');
    expect(payload.copy_code).toBe('FESTIVE50');
  });

  // -------------------------------------------------------------
  // Test 10: Invalid template mapping error handling
  // -------------------------------------------------------------
  it('10. throws BadRequestException when sending unmapped template', async () => {
    prismaMock.rndtechnosoft_crm_message_templates.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      tenant_id: TENANT_ID,
      template_name: 'Unmapped Template',
      template_code: 'crm_unmapped',
      message_body: 'Some body text',
    });

    // Mapping is null
    prismaMock.rndtechnosoft_crm_whatsapp_mappings.findFirst.mockResolvedValue(null);

    await expect(
      messagingService.sendMappedTemplateMessage(TENANT_ID, {
        template_id: 'crm_unmapped',
        recipient: '919876543210',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // -------------------------------------------------------------
  // Test 11: Provider authentication failure
  // -------------------------------------------------------------
  it('11. throws UnauthorizedException when provider credentials are missing or rejected', async () => {
    await expect(
      provider.sendTemplateMessage(
        {
          phone_number: '919876543210',
          template_name: 'order_dispatch',
          template_language: 'en',
        },
        { vendorUid: 'vendor_123', bearerToken: '' },
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  // -------------------------------------------------------------
  // Test 12: Message status retrieval
  // -------------------------------------------------------------
  it('12. retrieves and updates message delivery status by wamid', async () => {
    const WAMID = 'wamid.HBgMOTE4ODU2MDY2NTI5FQIAERgSQkUxODQ2QkU5QTc3QkQ5NzZCAA==';
    prismaMock.rndtechnosoft_crm_whatsapp_logs.findFirst.mockResolvedValue({
      id: 'log-123',
      tenant_id: TENANT_ID,
      provider_message_id: WAMID,
      status: 'SENT',
    });

    prismaMock.rndtechnosoft_crm_whatsapp_configs.findFirst.mockResolvedValue({
      vendor_uid: 'vendor_123',
      bearer_token_encrypted: 'token',
    });

    jest.spyOn(provider, 'getMessageStatus').mockResolvedValue({
      status: 'DELIVERED',
      timestamp: '2026-11-04T07:00:00Z',
      raw: { status: 'DELIVERED' },
    });

    prismaMock.rndtechnosoft_crm_whatsapp_logs.update.mockResolvedValue({
      id: 'log-123',
      tenant_id: TENANT_ID,
      provider_message_id: WAMID,
      status: 'DELIVERED',
    });

    const refreshed = await messagingService.refreshMessageStatus(TENANT_ID, 'log-123');
    expect(refreshed.status).toBe('DELIVERED');
    expect(prismaMock.rndtechnosoft_crm_whatsapp_logs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED' }),
      }),
    );
  });
});

