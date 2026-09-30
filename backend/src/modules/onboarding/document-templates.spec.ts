import { Prisma } from '@prisma/client';
import { formatInr, formatLetterDate, renderTemplate, templateProblem } from './document-templates';
import { OnboardingPdfService, pdfSafe } from './onboarding-pdf.service';

describe('letter templates', () => {
  it('formats amounts in Indian grouping from the decimal, never a float', () => {
    expect(formatInr(new Prisma.Decimal('1200000.75'))).toBe('INR 12,00,000.75');
    expect(formatInr(new Prisma.Decimal('999'))).toBe('INR 999.00');
    expect(formatInr(new Prisma.Decimal('12345678901.1'))).toBe('INR 12,34,56,78,901.10');
    expect(formatInr(new Prisma.Decimal('0.1').add('0.2'))).toBe('INR 0.30');
  });

  it('accepts only the listed placeholders, written properly', () => {
    expect(templateProblem('OFFER_LETTER', 'Offer: {{ job_title }}', 'Dear {{candidate_name}}')).toBeNull();
    expect(templateProblem('OFFER_LETTER', 'Offer', 'Dear {{name}} {{ssn}}')).toBe("These placeholders don't exist: {{name}}, {{ssn}}. Use only the ones listed.");
    expect(templateProblem('OFFER_LETTER', 'Offer', 'Dear {{candidate_name}')).toBe('A placeholder is not closed properly. Write it as {{name}}.');
  });

  it('fills placeholders with their values', () => {
    expect(renderTemplate('Dear {{candidate_name}}, from {{ company_name }}.', { candidate_name: 'Priya', company_name: 'Acme' })).toBe('Dear Priya, from Acme.');
    expect(formatLetterDate(new Date('2026-11-01'))).toBe('1 November 2026');
  });
});

describe('letter PDFs', () => {
  it('keeps text the built-in font can show, replacing what it cannot', () => {
    expect(pdfSafe('Pay: ₹ 5,000 – “fair” café')).toBe('Pay: INR 5,000 – “fair” café');
    expect(pdfSafe('नमस्ते Priya')).toBe('?????? Priya');
  });

  it('renders a valid PDF with the letter and its table', async () => {
    const bytes = await new OnboardingPdfService().render({
      companyName: 'Acme Technologies',
      reference: 'OFR-2026-123456',
      dateText: '30 September 2026',
      title: 'Offer of employment',
      body: 'Dear Priya,\n\nWe are pleased to offer you the role.',
      table: { heading: 'Annual compensation', rows: [['Basic', 'INR 9,00,000.00']], total: ['Total (CTC)', 'INR 9,00,000.00'] },
      footer: 'Please respond by 15 October 2026.',
    });
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.subarray(-6).toString()).toContain('%%EOF');
  });
});
