import * as pdfkit from 'pdfkit';
import { readFileSync } from 'fs';
import * as path from 'path';
import { makePng } from '../../../test/support/png';
import { inspectPdf } from '../../../test/support/pdf-content';
import { sampleValues, SAMPLE_OFFER_TABLE } from './document-templates';
import { DocumentPdfService, PdfLayout, PdfLetterhead, uniformMargins } from './document-pdf.service';
import { defaultDocument, DocNode, DOCUMENT_STYLE, documentText, DocumentProblem, fillDocument, legacyDocument, parseDocument } from './rich-document';

const PDFDocument = ((pdfkit as unknown as { default?: unknown }).default ?? pdfkit) as unknown as typeof import('pdfkit');
const A4_HEIGHT = 841.89;
const MM = 72 / 25.4;
/** A letter made in the frontend editor (Tiptap), using each toolbar feature once. Tests run from the backend folder. */
const editorOutput = () => JSON.parse(readFileSync(path.join(process.cwd(), 'test/support/tiptap-letter.json'), 'utf8'));
const measure = (font: string, size: number, text: string) => new PDFDocument({ autoFirstPage: true }).font(font).fontSize(size).widthOfString(text);

const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const style = (attrs: Record<string, unknown>) => ({ type: 'textStyle', attrs: { fontFamily: null, fontSize: null, color: null, backgroundColor: null, ...attrs } });
const para = (content: unknown[], attrs: Record<string, unknown> = {}) => ({ type: 'paragraph', attrs: { textAlign: null, lineHeight: null, spaceBefore: null, spaceAfter: null, indent: null, ...attrs }, content });
const heading = (level: number, content: unknown[], attrs: Record<string, unknown> = {}) => ({ type: 'heading', attrs: { level, textAlign: null, ...attrs }, content });
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const parse = (d: unknown) => parseDocument('OFFER_LETTER', d);
const refused = (d: unknown) => {
  try {
    parse(d);
  } catch (error) {
    if (error instanceof DocumentProblem) return error.message;
    throw error;
  }
  return null;
};

describe('formatted letter documents', () => {
  it('keep only what can be printed, dropping attributes they don’t know', () => {
    const parsed = parse(doc(para([text('Hi', [{ type: 'bold' }, style({ fontSize: 12, extra: 'x' })])], { textAlign: 'center', future: 1 })));
    expect(parsed).toEqual(doc({ type: 'paragraph', attrs: { textAlign: 'center', lineHeight: null, spaceBefore: null, spaceAfter: null, indent: null }, content: [text('Hi', [{ type: 'bold' }, style({ fontSize: 12 })])] }));
    // A style with nothing set is dropped.
    expect(parse(doc(para([text('Hi', [style({})])]))).content![0].content![0]).toEqual(text('Hi'));
  });

  it('refuse what the PDF can’t print or the template can’t fill', () => {
    expect(refused(doc(para([text('Hi', [style({ fontFamily: 'comic-sans' })])])))).toBe('Choose one of the listed fonts; other fonts can’t be printed in the PDF.');
    expect(refused(doc(para([text('Hi', [style({ fontSize: 200 })])])))).toBe('Font size (pt) must be between 6 and 72.');
    expect(refused(doc(para([text('Hi', [style({ color: 'red' })])])))).toBe('Colours are written as #RRGGBB.');
    expect(refused(doc(para([text('Hi', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])])))).toContain('formatting that can’t be printed');
    expect(refused(doc({ type: 'codeBlock', content: [text('x')] }))).toContain('content that can’t be printed');
    expect(refused(doc(para([{ type: 'placeholder', attrs: { key: 'password' } }])))).toBe("The placeholder {{password}} doesn't exist. Use only the ones listed.");
    expect(refused(doc(para([text('Hello {{nobody}}')])))).toBe("These placeholders don't exist: {{nobody}}. Use only the ones listed.");
    expect(refused(doc(para([text('x')]), { type: 'compensationTable' }, { type: 'compensationTable' }))).toBe('The pay table can appear only once.');
    expect(refused(doc(para([])))).toBe('Enter the letter text.');
    expect(refused({ type: 'doc', content: [] })).toBe('The document is empty.');
    expect(refused(doc(para([text('x')], { lineHeight: 9 })))).toBe('Line height must be between 0.8 and 3.');
    expect(() => parseDocument('JOINING_LETTER', doc(para([text('x')]), { type: 'compensationTable' }))).toThrow('Only offer letters and quotations have a table.');
  });

  it('accept the editor’s own output with every kind of formatting, keeping all of it', () => {
    const fromEditor = editorOutput();
    const parsed = parse(fromEditor);
    // Only the list's unused "type" attribute is dropped.
    const withoutListType = JSON.parse(JSON.stringify(fromEditor, (key, value) => (key === 'type' && value === null ? undefined : value)));
    expect(parsed).toEqual(withoutListType);
    expect(documentText(parsed).body).toContain('Hello world here{{candidate_name}}\nNext');
  });

  it('read as plain text with their placeholders, titled by the first heading', () => {
    const d = parse(doc(para([text('Ref')]), heading(1, [text('Offer: '), { type: 'placeholder', attrs: { key: 'job_title' } }]), para([text('Line one'), { type: 'hardBreak' }, text('two')]), { type: 'bulletList', content: [{ type: 'listItem', content: [para([text('Point')])] }] }));
    expect(documentText(d)).toEqual({ title: 'Offer: {{job_title}}', body: 'Ref\n\nOffer: {{job_title}}\n\nLine one\ntwo\n\n• Point' });
  });

  it('fill placeholders with their values, keeping each placeholder’s formatting', () => {
    const d = parse(doc(para([text('Dear '), { type: 'placeholder', attrs: { key: 'candidate_name' }, marks: [{ type: 'bold' }, style({ fontSize: 12, fontFamily: 'times' })] }, text(', {{job_title}}')]), para([{ type: 'placeholder', attrs: { key: 'special_terms' } }])));
    const filled = fillDocument(d, { candidate_name: 'Rohan Mehta', job_title: 'Engineer', special_terms: 'One\nTwo' });
    expect(filled.content![0].content).toEqual([text('Dear '), text('Rohan Mehta', [{ type: 'bold' }, style({ fontSize: 12, fontFamily: 'times' })]), text(', Engineer')]);
    expect(filled.content![1].content).toEqual([text('One'), { type: 'hardBreak' }, text('Two')]);
    // The template itself is untouched.
    expect(d.content![0].content![1].type).toBe('placeholder');
  });

  it('start offer letters from the standard wording, every part of it a placeholder or editable text', () => {
    const d = parse(defaultDocument('OFFER_LETTER'));
    const body = documentText(d).body;
    expect(documentText(d).title).toBe('OFFER LETTER');
    for (const key of ['today', 'offer_reference', 'candidate_name', 'company_name', 'job_title', 'department', 'designation', 'reporting_manager', 'work_location', 'employment_type', 'salary', 'joining_date', 'probation_period', 'special_terms', 'offer_expiry_date']) {
      expect(body).toContain(`{{${key}}}`);
    }
    expect(body).toContain('Terms & Conditions');
    expect(body).toContain('Authorized Signatory');
  });

  it('turn plain-text templates into documents without losing a word', () => {
    const d = parse(legacyDocument('OFFER_LETTER', 'Offer: {{job_title}}', 'Dear {{candidate_name}},\n\nWelcome.\nRegards'));
    expect(documentText(d).body).toBe('Ref: {{offer_reference}}    Date: {{today}}\n\nOffer: {{job_title}}\n\nDear {{candidate_name}},\n\nWelcome.\nRegards');
  });
});

describe('formatted letter PDFs', () => {
  const pdf = new DocumentPdfService();
  const letter = (document: DocNode, extra: Record<string, unknown> = {}) => ({ companyName: 'Acme', reference: 'R', dateText: 'd', title: documentText(document).title, body: documentText(document).body, document, ...extra });
  const render = async (d: unknown, layout: Partial<PdfLayout> = {}, height = A4_HEIGHT, extra: Record<string, unknown> = {}) =>
    inspectPdf(await pdf.render(letter(fillDocument(parse(d), sampleValues('OFFER_LETTER')), extra), { pageSize: 'A4', marginsMm: uniformMargins(20), showPageNumbers: false, letterhead: null, ...layout }), height);
  const find = (pages: ReturnType<typeof inspectPdf>, t: string) => pages.flatMap((p) => p.texts).find((x) => x.text === t)!;

  it('formats only the selected words, and a placeholder’s value as the placeholder', async () => {
    const pages = await render(
      doc(para([
        text('We are '),
        text('pleased to offer you', [{ type: 'bold' }, { type: 'italic' }, style({ fontSize: 13 })]),
        text(' employment with '),
        { type: 'placeholder', attrs: { key: 'job_title' }, marks: [{ type: 'bold' }, style({ fontSize: 12, fontFamily: 'times' })] },
        text('.'),
      ])),
    );
    const parts = pages[0].texts;
    const expectedJobTitle = sampleValues('OFFER_LETTER').job_title;
    expect(parts.map((t) => [t.text, t.font, t.size])).toEqual([
      ['We are ', 'Helvetica', 11],
      ['pleased to offer you', 'Helvetica-BoldOblique', 13],
      [' employment with ', 'Helvetica', 11],
      [expectedJobTitle, 'Times-Bold', 12],
      ['.', 'Helvetica', 11],
    ]);
    // One line: a shared baseline, each piece starting where the one before ends.
    expect(new Set(parts.map((t) => t.top.toFixed(2))).size).toBe(1);
    expect(parts[1].x).toBeCloseTo(parts[0].x + measure('Helvetica', 11, 'We are '), 2);
    expect(parts[0].x).toBeCloseTo(20 * MM, 2);
  });

  it('prints the editor’s own output: font, size, colour and script as set', async () => {
    const fromEditor = editorOutput();
    const pages = await render(fromEditor, {}, A4_HEIGHT, { table: SAMPLE_OFFER_TABLE });
    const expectedName = sampleValues('OFFER_LETTER').candidate_name;
    // Superscript text is three quarters of its size.
    expect(find(pages, 'Hello')).toMatchObject({ font: 'Times-BoldItalic', size: 13 * DOCUMENT_STYLE.script.scale });
    expect(find(pages, expectedName)).toMatchObject({ font: 'Helvetica', size: 11 });
    expect(find(pages, 'Next').top).toBeGreaterThan(find(pages, expectedName).top);
    expect(find(pages, 'Hello').x).toBeCloseTo(20 * MM + 10 * MM, 2);
    expect(find(pages, 'Annual compensation')).toBeDefined();
  });

  it('draws headings in their style and fonts as chosen', async () => {
    const pages = await render(doc(heading(1, [text('Title')]), heading(4, [text('Sub')]), para([text('Times', [style({ fontFamily: 'times' })]), text(' Courier', [style({ fontFamily: 'courier' }), { type: 'italic' }])])));
    expect([find(pages, 'Title').font, find(pages, 'Title').size]).toEqual(['Helvetica-Bold', DOCUMENT_STYLE.headings[1].fontSize]);
    expect([find(pages, 'Sub').font, find(pages, 'Sub').size]).toEqual(['Helvetica-Oblique', 12]);
    expect(find(pages, 'Times').font).toBe('Times-Roman');
    expect(find(pages, ' Courier').font).toBe('Courier-Oblique');
  });

  it('aligns each paragraph on its own', async () => {
    const width = (210 - 40) * MM;
    const pages = await render(doc(heading(1, [text('OFFER LETTER')], { textAlign: 'center' }), para([text('Left')]), para([text('Right')], { textAlign: 'right' })));
    const title = find(pages, 'OFFER LETTER');
    expect(title.x).toBeCloseTo(20 * MM + (width - measure('Helvetica-Bold', 20, 'OFFER LETTER')) / 2, 2);
    expect(find(pages, 'Left').x).toBeCloseTo(20 * MM, 2);
    expect(find(pages, 'Right').x + measure('Helvetica', 11, 'Right')).toBeCloseTo(20 * MM + width, 2);
  });

  it('justifies every line of a paragraph but its last', async () => {
    const words = 'The employee agrees to the terms of this clause and to the policies of the company. '.repeat(4).trim();
    const pages = await render(doc(para([text(words)], { textAlign: 'justify' })));
    const lines = pages[0].texts;
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(line.x).toBeCloseTo(20 * MM, 2);
    expect(lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ')).toBe(words);
    // Every line but the last has its spaces widened to reach the right margin.
    expect(lines.map((l) => l.stretched)).toEqual([...lines.slice(0, -1).map(() => true), false]);
    const left = await render(doc(para([text(words)])));
    expect(left[0].texts.some((l) => l.stretched)).toBe(false);
  });

  it('spaces lines by the line height and paragraphs by the larger of the spaces between them', async () => {
    const long = 'Word '.repeat(80).trim();
    const at = async (lineHeight: number) => (await render(doc(para([text(long)], { lineHeight })))).flatMap((p) => p.texts).map((t) => t.top);
    const tight = await at(1);
    const loose = await at(2);
    expect(tight[1] - tight[0]).toBeCloseTo(11, 1);
    expect(loose[1] - loose[0]).toBeCloseTo(22, 1);

    const pages = await render(doc(para([text('One')], { spaceAfter: 20, lineHeight: 1 }), para([text('Two')], { spaceBefore: 10, lineHeight: 1 }), para([text('Three')], { spaceBefore: 30, lineHeight: 1 })));
    expect(find(pages, 'Two').top - find(pages, 'One').top).toBeCloseTo(11 + 20, 1);
    expect(find(pages, 'Three').top - find(pages, 'Two').top).toBeCloseTo(11 + 30, 1);
  });

  it('indents lists, with bullets and numbers before the text', async () => {
    const item = (t: string) => ({ type: 'listItem', content: [para([text(t)])] });
    const pages = await render(doc({ type: 'bulletList', content: [item('Laptop')] }, { type: 'orderedList', attrs: { start: 3 }, content: [item('Third'), item('Fourth')] }));
    const indent = 20 * MM + DOCUMENT_STYLE.listIndentMm * MM;
    expect(find(pages, 'Laptop').x).toBeCloseTo(indent, 2);
    // The bullet is WinAnsi 0x95, which the helper reads as Latin-1.
    expect(find(pages, '\u0095').x).toBeLessThan(indent);
    expect(find(pages, '3.').top).toBeCloseTo(find(pages, 'Third').top, 2);
    expect(find(pages, '4.')).toBeDefined();
  });

  it('puts the pay table where the letter places it', async () => {
    const pages = await render(doc(para([text('Before')]), { type: 'compensationTable' }, para([text('After')])), {}, A4_HEIGHT, { table: SAMPLE_OFFER_TABLE });
    const before = find(pages, 'Before').top;
    const tableHeading = find(pages, 'Annual compensation').top;
    expect(tableHeading).toBeGreaterThan(before);
    expect(find(pages, 'After').top).toBeGreaterThan(find(pages, 'Total (CTC)').top);
  });

  it('uses the template’s page size, margins and page numbers', async () => {
    const pages = await render(doc(para([text('Hello')])), { pageSize: 'LETTER', marginsMm: uniformMargins(30), showPageNumbers: true }, 792);
    expect(find(pages, 'Hello').x).toBeCloseTo(30 * MM, 2);
    expect(find(pages, 'Hello').top).toBeGreaterThan(30 * MM);
    expect(find(pages, 'Page 1 of 1')).toBeDefined();
  });

  it('keeps the text clear of the letterhead on every page', async () => {
    const letterhead: PdfLetterhead = {
      companyName: 'Acme', addressText: null, phone: null, email: null, website: null, registrationText: 'CIN U1', footerText: null,
      logoPosition: 'LEFT', logo: makePng(400, 100), headerImage: null, footerImage: null, headerHeightMm: 35, footerHeightMm: 20,
    };
    const body = Array.from({ length: 40 }, (_, i) => para([text(`Clause ${i + 1}. ` + 'The employee agrees to the terms. '.repeat(6))]));
    const pages = await render(doc(...body), { letterhead, showPageNumbers: true });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      for (const t of page.texts.filter((x) => x.text.startsWith('Clause') || x.size === 11)) {
        expect(t.top - t.size).toBeGreaterThan(20 * MM + 35 * MM);
        expect(t.top).toBeLessThan(A4_HEIGHT - 20 * MM - 20 * MM);
      }
    }
  });

  it('parses, validates and renders custom tables with merged cells and borders', async () => {
    const tableDoc = doc(
      para([text('Letter with custom salary table:')]),
      {
        type: 'table',
        attrs: { alignment: 'center' },
        content: [
          {
            type: 'tableRow',
            attrs: { rowHeight: 24 },
            content: [
              {
                type: 'tableHeader',
                attrs: { colspan: 2, backgroundColor: '#f1f5f9', borderBottom: '1pt solid #000000', textAlign: 'center' },
                content: [para([text('Annexure - A: Salary Structure', [{ type: 'bold' }])])],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { borderRight: '1pt solid #000000', borderBottom: '0.5pt solid #000000' },
                content: [para([text('Basic Salary')])],
              },
              {
                type: 'tableCell',
                attrs: { borderBottom: '0.5pt solid #000000', textAlign: 'right' },
                content: [para([{ type: 'placeholder', attrs: { key: 'annual_salary' } }])],
              },
            ],
          },
        ],
      },
      para([text('End of letter.')]),
    );

    const parsed = parse(tableDoc);
    expect(parsed.type).toBe('doc');
    const tableNode = parsed.content!.find((n) => n.type === 'table')!;
    expect(tableNode).toBeDefined();
    expect(tableNode.content!.length).toBe(2);

    // Verify fillDocument fills placeholders inside table cells
    const filled = fillDocument(parsed, { annual_salary: 'INR 12,00,000.00' });
    const textOut = documentText(filled);
    expect(textOut.body).toContain('Annexure - A: Salary Structure');
    expect(textOut.body).toContain('Basic Salary');
    expect(textOut.body).toContain('INR 12,00,000.00');

    // Verify PDF rendering renders the table
    const pages = await render(filled);
    expect(find(pages, 'Letter with custom salary table:')).toBeDefined();
    expect(find(pages, 'Annexure - A: Salary Structure')).toBeDefined();
    expect(find(pages, 'Basic Salary')).toBeDefined();
    expect(find(pages, 'INR 12,00,000.00')).toBeDefined();
    expect(find(pages, 'End of letter.')).toBeDefined();
  });
});
