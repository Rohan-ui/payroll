import React from 'react';
import { NotAvailable } from '../components/NotAvailable';

/** Screens whose data the platform does not record yet. They say so instead of showing samples. */

export const HqCopilotView: React.FC = () => (
  <NotAvailable
    title="HQ copilot"
    reason="No AI model is connected to Platform HQ. The earlier assistant answered from canned text with invented revenue figures, so it has been removed."
    needs={[
      'A configured AI provider and an agreement on what platform data it may read',
      'Answers grounded in the Command Centre figures, with sources shown',
    ]}
  />
);

export const TransactionsView: React.FC = () => (
  <NotAvailable
    title="Transactions"
    reason="Payment attempts are not recorded. Only platform invoices are stored, and none carry a payment transaction yet."
    needs={['A payment gateway integration that records each charge, refund and failure', 'A payments table linked to invoices']}
  />
);

export const FormsView: React.FC = () => (
  <NotAvailable
    title="Form builder"
    reason="Website forms and their submissions are not stored anywhere. The previous screen listed two sample forms."
    needs={['A forms table and a submissions table', 'A public endpoint that accepts and validates submissions']}
  />
);

export const SeoAnalyticsView: React.FC = () => (
  <NotAvailable
    title="SEO analytics"
    reason="No website analytics or search console account is connected, so there are no visits, rankings or search terms to show."
    needs={['A connected analytics source (for example Google Search Console)']}
  />
);
