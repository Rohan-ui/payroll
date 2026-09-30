import { makePng } from '../../../test/support/png';
import { inspectPdf as inspect } from '../../../test/support/pdf-content';
import { OnboardingPdfService, PdfLayout, PdfLetterhead, readableImage } from './onboarding-pdf.service';

const A4_HEIGHT = 841.89;
const MM = 72 / 25.4;
const letterhead = (extra: Partial<PdfLetterhead> = {}): PdfLetterhead => ({
  companyName: 'Acme Letterhead Pvt Ltd',
  addressText: '4th Floor, Baner Road, Pune 411045',
  phone: '+91 20 4000 1234',
  email: 'hr@acme.test',
  website: 'acme.test',
  registrationText: 'CIN U72200MH2015PTC000001',
  footerText: 'Confidential',
  logoPosition: 'LEFT',
  logo: makePng(400, 100),
  headerImage: null,
  footerImage: null,
  headerHeightMm: 30,
  footerHeightMm: 16,
  ...extra,
});
const layout = (extra: Partial<PdfLayout> = {}): PdfLayout => ({ pageSize: 'A4', marginMm: 20, showPageNumbers: true, letterhead: letterhead(), ...extra });
const longBody = Array.from({ length: 24 }, (_, i) => `Clause ${i + 1}. ` + 'The employee agrees to the terms of this clause. '.repeat(12)).join('\n\n');
const SIGNATURE = 'Yours sincerely,\nPriya Sharma\nHead of Human Resources\nAcme Letterhead Pvt Ltd';

describe('letter PDFs', () => {
  const pdf = new OnboardingPdfService();

  it('repeats the letterhead and page numbers on every page, and keeps the text clear of both', async () => {
    const pages = inspect(await pdf.render({ companyName: 'Acme', reference: 'OFR-1', dateText: '1 October 2026', title: 'Employment agreement', body: longBody }, layout()), A4_HEIGHT);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const headerBottom = 20 * MM + 30 * MM;
    const footerTop = A4_HEIGHT - 20 * MM - 16 * MM;
    pages.forEach((page, index) => {
      expect(page.texts.some((t) => t.text === 'Acme Letterhead Pvt Ltd')).toBe(true);
      expect(page.texts.some((t) => t.text === 'CIN U72200MH2015PTC000001\nConfidential' || t.text === 'CIN U72200MH2015PTC000001')).toBe(true);
      expect(page.texts.map((t) => t.text)).toContain(`Page ${index + 1} of ${pages.length}`);
      for (const body of page.texts.filter((t) => t.size === 10.5)) {
        expect(body.top).toBeGreaterThan(headerBottom);
        expect(body.top).toBeLessThan(footerTop);
      }
    });
  });

  it('keeps the logo’s proportions and embeds it once for all pages', async () => {
    const pages = inspect(await pdf.render({ companyName: 'Acme', reference: 'R', dateText: 'd', title: 'T', body: longBody }, layout()), A4_HEIGHT);
    const placed = pages.flatMap((p) => p.images);
    expect(placed).toHaveLength(pages.length);
    expect(new Set(placed.map((i) => i.name)).size).toBe(1);
    for (const image of placed) {
      expect(image.width / image.height).toBeCloseTo(4, 2);
      expect(image.height).toBeLessThanOrEqual(30 * MM + 0.01);
    }
  });

  it('draws header and footer artwork in place of the text, undistorted', async () => {
    const pages = inspect(
      await pdf.render({ companyName: 'Acme', reference: 'R', dateText: 'd', title: 'T', body: 'Short.' }, layout({ letterhead: letterhead({ headerImage: makePng(1200, 180), footerImage: makePng(1200, 90), logo: null }) })),
      A4_HEIGHT,
    );
    const [header, footer] = pages[0].images;
    expect(header.width / header.height).toBeCloseTo(1200 / 180, 2);
    expect(footer.width / footer.height).toBeCloseTo(1200 / 90, 2);
    expect(pages[0].texts.some((t) => t.text === 'Acme Letterhead Pvt Ltd')).toBe(false);
  });

  it('never splits a signature block or a table row across pages', async () => {
    // Enough text that the signature falls at a page end if it were allowed to split.
    for (let paragraphs = 8; paragraphs <= 14; paragraphs += 1) {
      const body = Array.from({ length: paragraphs }, (_, i) => `Clause ${i + 1}. ` + 'Terms apply. '.repeat(40)).join('\n\n') + `\n\n${SIGNATURE}`;
      const rows = Array.from({ length: 30 }, (_, i) => [`Allowance ${i + 1}`, `INR ${i + 1},000.00`] as [string, string]);
      const pages = inspect(await pdf.render({ companyName: 'Acme', reference: 'R', dateText: 'd', title: 'T', body, table: { heading: 'Pay', rows, total: ['Total', 'INR 4,65,000.00'] } }, layout()), A4_HEIGHT);
      const withSignature = pages.filter((p) => p.texts.some((t) => ['Yours sincerely,', 'Head of Human Resources'].includes(t.text)));
      expect(withSignature).toHaveLength(1);
      expect(withSignature[0].texts.filter((t) => ['Yours sincerely,', 'Priya Sharma', 'Head of Human Resources'].includes(t.text))).toHaveLength(3);
      for (const [label, amount] of rows) {
        const page = pages.find((p) => p.texts.some((t) => t.text === label));
        expect(page?.texts.some((t) => t.text === amount)).toBe(true);
      }
    }
  });

  it('keeps the plain layout for templates without a letterhead, and marks samples', async () => {
    const pages = inspect(await pdf.render({ companyName: 'Plain Co', reference: 'R', dateText: 'd', title: 'Offer', body: 'Hello.', watermark: 'SAMPLE' }), A4_HEIGHT);
    expect(pages).toHaveLength(1);
    expect(pages[0].texts[0]).toMatchObject({ text: 'Plain Co', size: 15 });
    expect(pages[0].texts.map((t) => t.text)).toContain('SAMPLE');
    expect(pages[0].texts.some((t) => t.text.startsWith('Page '))).toBe(false);
  });

  it('uses the chosen page size and margins', async () => {
    const pages = inspect(await pdf.render({ companyName: 'Acme', reference: 'R', dateText: 'd', title: 'T', body: 'Hello.' }, layout({ pageSize: 'LETTER', marginMm: 30, letterhead: null })), 792);
    const ref = pages[0].texts.find((t) => t.text.startsWith('Ref'));
    expect(ref?.top).toBeGreaterThan(30 * MM);
  });

  it('accepts only images pdfkit can place', () => {
    expect(readableImage(makePng(10, 20))).toEqual({ width: 10, height: 20 });
    expect(readableImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))).toBeNull();
    expect(readableImage(Buffer.from('<svg></svg>'))).toBeNull();
  });
});
