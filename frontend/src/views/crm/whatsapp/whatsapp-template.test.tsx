import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppMappingWizardModal } from './WhatsAppMappingWizardModal';
import { WhatsAppSendModal } from './WhatsAppSendModal';
import type { CrmMessageTemplate, WhatsAppProviderTemplate } from '../../../api/whatsapp.api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_CRM_TEMPLATE: CrmMessageTemplate = {
  id: 'crm-order-dispatch',
  tenant_id: 't-1',
  template_code: 'crm_order_dispatch',
  template_name: 'Order Dispatch Notification',
  category: 'OPERATIONS',
  channel: 'WHATSAPP',
  message_body: 'Hello {{customer_name}}, your order {{order_id}} has been dispatched. Vehicle: {{vehicle_number}}',
  detected_variables: ['customer_name', 'order_id', 'vehicle_number'],
  is_active: true,
  created_at: '2026-11-04T00:00:00Z',
  updated_at: '2026-11-04T00:00:00Z',
};

const SAMPLE_PROVIDER_TEMPLATE: WhatsAppProviderTemplate = {
  name: 'order_dispatch',
  language: 'en',
  category: 'UTILITY',
  status: 'APPROVED',
  body_text: 'Hello {{1}}, your order {{2}} has been dispatched. Vehicle: {{3}}',
  body_variables_count: 3,
  has_header: false,
  buttons_count: 0,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('WhatsApp Template Mapping & Messaging Frontend', () => {
  it('renders WhatsApp Mapping Wizard Step 1 with CRM template selection', async () => {
    await act(async () => {
      root.render(
        <WhatsAppMappingWizardModal
          isOpen={true}
          onClose={() => {}}
          onSaved={() => {}}
          crmTemplates={[SAMPLE_CRM_TEMPLATE]}
          providerTemplates={[SAMPLE_PROVIDER_TEMPLATE]}
        />
      );
    });

    expect(container.textContent).toContain('Step 1: Choose the Internal CRM Template');
    expect(container.textContent).toContain('Order Dispatch Notification');
    expect(container.textContent).toContain('customer_name');
    expect(container.textContent).toContain('order_id');
  });

  it('renders Quick Send Modal with lead context and variable inputs', async () => {
    await act(async () => {
      root.render(
        <WhatsAppSendModal
          isOpen={true}
          onClose={() => {}}
          crmTemplates={[SAMPLE_CRM_TEMPLATE]}
          defaultTemplateId={SAMPLE_CRM_TEMPLATE.id}
          leadContext={{
            id: 'lead-123',
            name: 'Rohan Sharma',
            company: 'Sharma Logistics',
            phone: '+919876543210',
            email: 'rohan@example.com',
          }}
        />
      );
    });

    expect(container.textContent).toContain('Send WhatsApp Template Message');
    expect(container.textContent).toContain('Hello Rohan Sharma');
    // Phone input should be pre-filled
    const phoneInput = container.querySelector('input[placeholder*="919876543210"]') as HTMLInputElement;
    expect(phoneInput).not.toBeNull();
    expect(phoneInput.value).toBe('+919876543210');
  });
});
