import { PLACEHOLDERS, TABLE_KINDS, templateProblem, TemplateKind } from './document-templates';

/**
 * Formatted letter documents: the editor's (Tiptap / ProseMirror) JSON, kept as
 * the one source of truth for a template version. The editor shows it, the PDF
 * renderer draws it, and offers keep a filled copy of it. Only the node types,
 * marks and attributes below are accepted; everything is checked and rebuilt
 * here, so nothing the browser sends is stored as it came.
 *
 * Units: font sizes and spacing in points (as in the PDF), indents in
 * millimetres, line height as a multiple of the font size (as CSS).
 */

export interface DocMark {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'subscript' | 'superscript' | 'textStyle';
  attrs?: { fontFamily?: FontKey | null; fontSize?: number | null; color?: string | null; backgroundColor?: string | null };
}
export interface DocNode {
  type: 'doc' | 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'listItem' | 'horizontalRule' | 'hardBreak' | 'text' | 'placeholder' | 'compensationTable';
  attrs?: Record<string, string | number | null>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}
export type BlockAlign = 'left' | 'center' | 'right' | 'justify';

/** Fonts every PDF reader has (the PDF standard fonts), so the PDF shows exactly the font chosen. */
export const FONT_FAMILIES = {
  helvetica: { label: 'Helvetica (Arial)', css: 'Helvetica, Arial, sans-serif', regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', boldItalic: 'Helvetica-BoldOblique' },
  times: { label: 'Times New Roman', css: 'Times New Roman, Times, serif', regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', boldItalic: 'Times-BoldItalic' },
  courier: { label: 'Courier New', css: 'Courier New, Courier, monospace', regular: 'Courier', bold: 'Courier-Bold', italic: 'Courier-Oblique', boldItalic: 'Courier-BoldOblique' },
} as const;
export type FontKey = keyof typeof FONT_FAMILIES;

/**
 * How unformatted text looks. The editor styles the page from these (sent with
 * each template) and the renderer draws with them, so both agree.
 */
export const DOCUMENT_STYLE = {
  fontFamily: 'helvetica' as FontKey,
  fontSize: 11,
  color: '#111111',
  lineHeight: 1.3,
  paragraph: { spaceBefore: 0, spaceAfter: 6 },
  /** Paragraphs inside list items. */
  listParagraph: { spaceBefore: 0, spaceAfter: 2 },
  headings: {
    1: { fontSize: 20, bold: true, italic: false, color: '#111111', spaceBefore: 0, spaceAfter: 10 },
    2: { fontSize: 16, bold: true, italic: false, color: '#111111', spaceBefore: 12, spaceAfter: 6 },
    3: { fontSize: 13, bold: true, italic: false, color: '#111111', spaceBefore: 10, spaceAfter: 4 },
    /** The subheading. */
    4: { fontSize: 12, bold: false, italic: true, color: '#444444', spaceBefore: 4, spaceAfter: 4 },
  } as Record<1 | 2 | 3 | 4, { fontSize: number; bold: boolean; italic: boolean; color: string; spaceBefore: number; spaceAfter: number }>,
  headingLineHeight: 1.2,
  listIndentMm: 7,
  rule: { spaceBefore: 6, spaceAfter: 6, thickness: 0.75, color: '#999999' },
  table: { spaceBefore: 6, spaceAfter: 10 },
  /** Superscript and subscript: smaller, raised or lowered by a share of the surrounding size. */
  script: { scale: 0.75, raise: 0.33, drop: 0.2 },
};

export const FONT_SIZE_RANGE = { min: 6, max: 72 };
const LIMITS = { nodes: 4000, depth: 12, characters: 30000 };
const COLOR = /^#[0-9a-f]{6}$/i;
const ALIGNS: BlockAlign[] = ['left', 'center', 'right', 'justify'];
const SIMPLE_MARKS = ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript'] as const;

export class DocumentProblem extends Error {}

const fail = (message: string): never => {
  throw new DocumentProblem(message);
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number, what: string): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${what} must be between ${min} and ${max}.`);
  return Math.round((v as number) * 100) / 100;
};

/**
 * The document checked and rebuilt with only what the editor may store: known
 * nodes, marks and attributes in range, placeholders of this kind of template.
 * Attributes it doesn't know are dropped; anything else wrong is refused.
 */
export function parseDocument(kind: TemplateKind, input: unknown): DocNode {
  const allowed = new Set(PLACEHOLDERS[kind].map((p) => p.key));
  let nodes = 0;
  let characters = 0;
  let tables = 0;

  const blockAttrs = (attrs: Record<string, unknown>) => ({
    textAlign: attrs.textAlign === null || attrs.textAlign === undefined ? null : ALIGNS.includes(attrs.textAlign as BlockAlign) ? (attrs.textAlign as BlockAlign) : fail('Choose left, centre, right or justified alignment.'),
    lineHeight: num(attrs.lineHeight, 0.8, 3, 'Line height'),
    spaceBefore: num(attrs.spaceBefore, 0, 72, 'Space before a paragraph (pt)'),
    spaceAfter: num(attrs.spaceAfter, 0, 72, 'Space after a paragraph (pt)'),
    indent: num(attrs.indent, 0, 80, 'Indent (mm)'),
  });

  const marks = (value: unknown): DocMark[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return fail('The document is not in the expected format.');
    const out: DocMark[] = [];
    for (const m of value) {
      if (!isRecord(m)) fail('The document is not in the expected format.');
      const type = (m as Record<string, unknown>).type;
      if ((SIMPLE_MARKS as readonly unknown[]).includes(type)) {
        out.push({ type: type as DocMark['type'] });
      } else if (type === 'textStyle') {
        const a = isRecord((m as Record<string, unknown>).attrs) ? ((m as Record<string, unknown>).attrs as Record<string, unknown>) : {};
        const fontFamily = a.fontFamily === null || a.fontFamily === undefined ? null : typeof a.fontFamily === 'string' && a.fontFamily in FONT_FAMILIES ? (a.fontFamily as FontKey) : fail('Choose one of the listed fonts; other fonts can’t be printed in the PDF.');
        const color = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : fail('Colours are written as #RRGGBB.'));
        const attrs = { fontFamily, fontSize: num(a.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, 'Font size (pt)'), color: color(a.color), backgroundColor: color(a.backgroundColor) };
        // A style with nothing set is no style.
        if (Object.values(attrs).some((v) => v !== null)) out.push({ type: 'textStyle', attrs });
      } else {
        fail('The document has formatting that can’t be printed. Remove it and try again.');
      }
    }
    return out.length ? out : undefined;
  };

  const inline = (n: Record<string, unknown>): DocNode => {
    const m = marks(n.marks);
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || !n.text) return fail('The document is not in the expected format.');
      characters += n.text.length;
      return { type: 'text', text: n.text, ...(m ? { marks: m } : {}) };
    }
    if (n.type === 'hardBreak') return { type: 'hardBreak' };
    if (n.type === 'placeholder') {
      const key = isRecord(n.attrs) ? n.attrs.key : undefined;
      if (typeof key !== 'string' || !allowed.has(key)) fail(`The placeholder {{${String(key)}}} doesn't exist. Use only the ones listed.`);
      return { type: 'placeholder', attrs: { key: key as string }, ...(m ? { marks: m } : {}) };
    }
    return fail('The document is not in the expected format.');
  };

  const inlineContent = (content: unknown): DocNode[] | undefined => {
    if (content === undefined) return undefined;
    if (!Array.isArray(content)) return fail('The document is not in the expected format.');
    return content.map((c) => {
      nodes += 1;
      if (!isRecord(c)) return fail('The document is not in the expected format.');
      return inline(c);
    });
  };

  const block = (n: unknown, depth: number, top: boolean): DocNode => {
    nodes += 1;
    if (nodes > LIMITS.nodes || depth > LIMITS.depth) fail('The document is too long or too deeply nested. Shorten it and try again.');
    if (!isRecord(n)) return fail('The document is not in the expected format.');
    const attrs = isRecord(n.attrs) ? n.attrs : {};
    const children = (allowedTypes: string[]) => {
      if (!Array.isArray(n.content) || n.content.length === 0) return fail('The document is not in the expected format.');
      return n.content.map((c) => {
        if (!isRecord(c) || !allowedTypes.includes(c.type as string)) return fail('The document is not in the expected format.');
        return block(c, depth + 1, false);
      });
    };
    switch (n.type) {
      case 'paragraph': {
        const content = inlineContent(n.content);
        return { type: 'paragraph', attrs: blockAttrs(attrs), ...(content?.length ? { content } : {}) };
      }
      case 'heading': {
        const level = attrs.level;
        if (![1, 2, 3, 4].includes(level as number)) fail('Headings are levels 1 to 4.');
        const content = inlineContent(n.content);
        return { type: 'heading', attrs: { level: level as number, ...blockAttrs(attrs) }, ...(content?.length ? { content } : {}) };
      }
      case 'bulletList':
        return { type: 'bulletList', content: children(['listItem']) };
      case 'orderedList':
        return { type: 'orderedList', attrs: { start: num(attrs.start ?? 1, 0, 9999, 'A numbered list’s first number') ?? 1 }, content: children(['listItem']) };
      case 'listItem':
        return { type: 'listItem', content: children(['paragraph', 'heading', 'bulletList', 'orderedList']) };
      case 'horizontalRule':
        return { type: 'horizontalRule' };
      case 'compensationTable':
        if (!TABLE_KINDS[kind]) fail('Only offer letters and quotations have a table.');
        if (!top) fail(`The ${TABLE_KINDS[kind]} can’t be inside a list.`);
        tables += 1;
        if (tables > 1) fail(`The ${TABLE_KINDS[kind]} can appear only once.`);
        return { type: 'compensationTable' };
      default:
        return fail('The document has content that can’t be printed. Remove it and try again.');
    }
  };

  if (!isRecord(input) || input.type !== 'doc' || !Array.isArray(input.content) || input.content.length === 0) fail('The document is empty.');
  const doc: DocNode = { type: 'doc', content: (input as { content: unknown[] }).content.map((c) => block(c, 1, true)) };
  if (characters > LIMITS.characters) fail(`The document is longer than ${LIMITS.characters.toLocaleString('en-IN')} characters. Shorten it and try again.`);
  const text = documentText(doc);
  if (!text.body.trim()) fail('Enter the letter text.');
  // Placeholders typed as text are checked like those inserted from the list.
  const problem = templateProblem(kind, '', text.body);
  if (problem) fail(problem);
  return doc;
}

const textOf = (nodes: DocNode[] | undefined): string =>
  (nodes ?? []).map((n) => (n.type === 'text' ? n.text : n.type === 'hardBreak' ? '\n' : n.type === 'placeholder' ? `{{${n.attrs?.key}}}` : '')).join('');

/**
 * The document as plain text (placeholders as {{key}}): its heading for lists
 * and the PDF's title, and its text for places that show letters as text.
 */
export function documentText(doc: DocNode): { title: string; body: string } {
  const blocks: string[] = [];
  const walk = (nodes: DocNode[] | undefined, prefix = '') => {
    for (const n of nodes ?? []) {
      if (n.type === 'paragraph' || n.type === 'heading') blocks.push(prefix + textOf(n.content));
      else if (n.type === 'bulletList') n.content?.forEach((item) => walk(item.content, `${prefix}• `));
      else if (n.type === 'orderedList') n.content?.forEach((item, i) => walk(item.content, `${prefix}${Number(n.attrs?.start ?? 1) + i}. `));
    }
  };
  walk(doc.content);
  const heading = doc.content?.find((n) => n.type === 'heading' && textOf(n.content).trim());
  const first = heading ? textOf(heading.content) : blocks.find((b) => b.trim()) ?? '';
  return { title: first.replace(/\s+/g, ' ').trim().slice(0, 200), body: blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() };
}

const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Text (which may have line breaks) as text nodes and hard breaks, all with the same marks. */
function textNodes(text: string, marks: DocMark[] | undefined): DocNode[] {
  const out: DocNode[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) out.push({ type: 'hardBreak' });
    if (line) out.push({ type: 'text', text: line, ...(marks ? { marks } : {}) });
  });
  return out;
}

/**
 * The document with every placeholder replaced by its value, keeping the
 * placeholder's formatting: what an offer stores and prints.
 */
export function fillDocument(doc: DocNode, values: Record<string, string>): DocNode {
  const fill = (n: DocNode): DocNode[] => {
    if (n.type === 'placeholder') return textNodes(values[String(n.attrs?.key)] ?? '', n.marks);
    if (n.type === 'text') return textNodes((n.text ?? '').replace(TOKEN, (_m, key: string) => values[key] ?? ''), n.marks);
    if (!n.content) return [n];
    const content = n.content.flatMap(fill);
    const { content: _old, ...rest } = n;
    return [content.length ? { ...rest, content } : rest];
  };
  return fill(doc)[0];
}

/** Text with {{placeholders}} as text and placeholder nodes, with the given marks. */
function withPlaceholders(text: string, marks?: DocMark[]): DocNode[] {
  const out: DocNode[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) out.push({ type: 'hardBreak' });
    let at = 0;
    for (const m of line.matchAll(TOKEN)) {
      if (m.index! > at) out.push({ type: 'text', text: line.slice(at, m.index), ...(marks ? { marks } : {}) });
      out.push({ type: 'placeholder', attrs: { key: m[1] }, ...(marks ? { marks } : {}) });
      at = m.index! + m[0].length;
    }
    if (at < line.length) out.push({ type: 'text', text: line.slice(at), ...(marks ? { marks } : {}) });
  });
  return out;
}

const style = (attrs: DocMark['attrs']): DocMark[] => [{ type: 'textStyle', attrs: { fontFamily: null, fontSize: null, color: null, backgroundColor: null, ...attrs } }];
interface BlockAttrs { textAlign: BlockAlign | null; lineHeight: number | null; spaceBefore: number | null; spaceAfter: number | null; indent: number | null }
const noBlock: BlockAttrs = { textAlign: null, lineHeight: null, spaceBefore: null, spaceAfter: null, indent: null };
const p = (text: string, attrs: Partial<typeof noBlock> = {}, marks?: DocMark[]): DocNode => ({ type: 'paragraph', attrs: { ...noBlock, ...attrs }, content: withPlaceholders(text, marks) });

/**
 * A plain-text template (from before formatting) as a document that prints
 * the way it did: the reference and date line, the heading, then the
 * paragraphs (a blank line between them) in the same sizes and spacing.
 */
export function legacyDocument(kind: TemplateKind, title: string, body: string): DocNode {
  const keys = new Set(PLACEHOLDERS[kind].map((k) => k.key));
  const content: DocNode[] = [];
  if (keys.has('offer_reference') && keys.has('today')) content.push(p('Ref: {{offer_reference}}    Date: {{today}}', { spaceAfter: 12 }, style({ fontSize: 9, color: '#555555' })));
  content.push({ type: 'heading', attrs: { level: 1, ...noBlock, spaceAfter: 9 }, content: withPlaceholders(title.trim(), style({ fontSize: 13 })) });
  for (const paragraph of body.split(/\n\s*\n/)) {
    if (paragraph.trim()) content.push(p(paragraph.trim(), { lineHeight: 1.35, spaceAfter: 8 }, style({ fontSize: 10.5 })));
  }
  return { type: 'doc', content };
}

/** The wording a new template starts with; every part of it can be changed. */
export function defaultDocument(kind: TemplateKind): DocNode | null {
  const heading = (level: number, text: string, attrs: Partial<typeof noBlock> = {}): DocNode => ({ type: 'heading', attrs: { level, ...noBlock, ...attrs }, content: withPlaceholders(text) });
  if (kind === 'QUOTATION') {
    return {
      type: 'doc',
      content: [
        heading(1, 'QUOTATION', { textAlign: 'center', spaceAfter: 18 }),
        p('Quotation No: {{quotation_number}}\nDate: {{quotation_date}}\nValid until: {{valid_until}}', { spaceAfter: 14 }),
        p('To,\n{{contact_person}}\n{{client_company}}\n{{client_address}}\nGSTIN: {{client_gstin}}', { spaceAfter: 12 }),
        p('Dear {{contact_person}},', { spaceAfter: 10 }),
        p('Thank you for your enquiry. We are pleased to quote as follows:', { textAlign: 'justify' }),
        { type: 'compensationTable' },
        p('Amount payable: {{total_amount}} (including GST of {{total_tax}}). Place of supply: {{place_of_supply}}.', { textAlign: 'justify' }),
        heading(3, 'Notes'),
        p('{{notes}}', { textAlign: 'justify' }),
        p('This quotation is valid until {{valid_until}}. Please contact us with any questions.', { textAlign: 'justify' }),
        p('For {{company_name}}', { spaceBefore: 12, spaceAfter: 24 }),
        p('Authorized Signatory\nGSTIN: {{company_gstin}}'),
      ],
    };
  }
  if (kind === 'APPRAISAL_LETTER') {
    return {
      type: 'doc',
      content: [
        heading(1, 'APPRAISAL LETTER', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}', { spaceAfter: 14 }),
        p('Dear {{employee_name}} ({{employee_code}}),', { spaceAfter: 10 }),
        p('Thank you for your contribution to {{company_name}} as {{designation}} in the {{department}} department during {{review_period}}.', { textAlign: 'justify' }),
        p('Your performance has been reviewed in the {{cycle_name}}. Your final score is {{final_score}}, rated {{final_rating}}.', { textAlign: 'justify' }),
        p('We appreciate your efforts and look forward to your continued growth with us. Please speak with {{manager_name}} about your goals for the coming period.', { textAlign: 'justify' }),
        p('Sincerely,', { spaceBefore: 12, spaceAfter: 24 }),
        p('{{company_name}}\nAuthorized Signatory'),
      ],
    };
  }
  if (kind !== 'OFFER_LETTER') return null;
  return {
    type: 'doc',
    content: [
      heading(1, 'OFFER LETTER', { textAlign: 'center', spaceAfter: 18 }),
      p('Date: {{today}}\nOffer Reference: {{offer_reference}}', { spaceAfter: 14 }),
      p('Dear {{candidate_name}},', { spaceAfter: 10 }),
      p('We are pleased to offer you employment with {{company_name}} for the position of {{job_title}} in the {{department}} department, with the designation of {{designation}}.', { textAlign: 'justify' }),
      p('You will report to {{reporting_manager}} and will be based at {{work_location}}. Your employment will be on a {{employment_type}} basis.', { textAlign: 'justify' }),
      p('Your annual compensation will be {{salary}}, subject to applicable company policies, statutory deductions, and the terms and conditions of your employment.', { textAlign: 'justify' }),
      { type: 'compensationTable' },
      p('Your expected date of joining is {{joining_date}}. You will be required to complete a probationary period of {{probation_period}}, during which your performance and suitability for the role will be evaluated in accordance with company policies.', { textAlign: 'justify' }),
      heading(3, 'Terms & Conditions'),
      p('{{special_terms}}', { textAlign: 'justify' }),
      p('This offer is subject to the successful completion of any required background verification, submission and verification of relevant documents, and compliance with the applicable policies and procedures of {{company_name}}.', { textAlign: 'justify' }),
      p('Please confirm your acceptance of this offer on or before {{offer_expiry_date}}. If we do not receive your acceptance by this date, this offer may be considered withdrawn unless otherwise agreed in writing.', { textAlign: 'justify' }),
      p('We are delighted to have you join {{company_name}} and look forward to your contribution and success with the organization.', { textAlign: 'justify' }),
      p('Sincerely,', { spaceBefore: 12, spaceAfter: 24 }),
      p('{{company_name}}\nAuthorized Signatory\n{{reporting_manager}}'),
    ],
  };
}
