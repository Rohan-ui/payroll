import { jest } from '@jest/globals';
import { WhatsAppProviderService } from './whatsapp-provider.service';
import { WhatsAppPayloadBuilderService } from './whatsapp-payload-builder.service';

const creds = { vendorUid: 'vendor-1', bearerToken: 'token-1', apiBaseUrl: 'https://provider.test/api' };

// Response bodies as the provider actually returns them, always with HTTP 200.
const REJECTED_TEMPLATE = {
  data: [],
  result: 'failed',
  message: 'Template for the selected language not found in the system, if you have created template recently on Facebook please sync templates again.',
};
const ACCEPTED = {
  data: { wamid: 'wamid.ABC123', status: 'accepted', phone_number: '919800000000' },
  result: 'success',
  message: 'Message processed',
};

function respondWith(body: unknown) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

describe('WhatsAppProviderService response handling', () => {
  const provider = new WhatsAppProviderService();

  afterEach(() => jest.restoreAllMocks());

  it('reports a template the provider refuses with HTTP 200 as a failure, with its reason', async () => {
    respondWith(REJECTED_TEMPLATE);
    const result = await provider.sendTemplateMessage(
      { phone_number: '919800000000', template_name: 'outreach', template_language: 'en' },
      creds,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe(REJECTED_TEMPLATE.message);
  });

  it('reports a refused text message as a failure', async () => {
    respondWith({ result: 'failed', message: 'Contact not found' });
    const result = await provider.sendMessage({ phone_number: '919800000000', message_body: 'hi' }, creds);
    expect(result).toMatchObject({ success: false, error: 'Contact not found' });
  });

  it('keeps the wamid of an accepted message so delivery updates can be matched', async () => {
    respondWith(ACCEPTED);
    const text = await provider.sendMessage({ phone_number: '919800000000', message_body: 'hi' }, creds);
    expect(text).toMatchObject({ success: true, messageId: 'wamid.ABC123' });

    respondWith(ACCEPTED);
    const template = await provider.sendTemplateMessage(
      { phone_number: '919800000000', template_name: 'outreach', template_language: 'en_US' },
      creds,
    );
    expect(template).toMatchObject({ success: true, messageId: 'wamid.ABC123' });
  });

  it('reads the templates out of the paginated template list', async () => {
    respondWith({
      result: 'success',
      message: null,
      data: {
        templateList: {
          current_page: 1,
          last_page: 1,
          total: 2,
          data: [
            { _uid: 'u1', template_name: 'hello_world', language: 'en_US', status: 'APPROVED', category: 'UTILITY', template_id: '1' },
            { _uid: 'u2', template_name: 'first_promo', language: 'en', status: 'APPROVED', category: 'MARKETING', template_id: '2' },
          ],
        },
      },
    });
    const templates = await provider.getTemplateList(creds);
    expect(templates.map(({ name, language, category }) => ({ name, language, category }))).toEqual([
      { name: 'hello_world', language: 'en_US', category: 'UTILITY' },
      { name: 'first_promo', language: 'en', category: 'MARKETING' },
    ]);
  });
});

describe('WhatsAppPayloadBuilderService template parameters', () => {
  const builder = new WhatsAppPayloadBuilderService();

  it('collapses new lines, tabs and runs of spaces, which WhatsApp refuses in parameters', () => {
    const payload = builder.buildPayload({
      mapping: { whatsapp_template_name: 'outreach', body_mapping: { field_1: 'address' }, header_mapping: { header_field_1: 'company' } },
      resolvedVariables: { address: ' 12 MG Road,\r\nPune\t411001     India ', company: 'Acme\nLtd' },
      recipientPhone: '9800000000',
    });
    expect(payload).toMatchObject({ phone_number: '919800000000', field_1: '12 MG Road, Pune 411001 India', header_field_1: 'Acme Ltd' });
  });
});
