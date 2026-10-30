import { randomUUID } from 'crypto';
import { HR_COMMON_PLACEHOLDERS, PLACEHOLDERS, TABLE_KINDS, templateProblem, TemplateKind } from './document-templates';

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

export interface DocImageAttrs {
  id: string;
  src: string;
  assetId?: string | null;
  alt?: string;
  category?: 'COMPANY_LOGO' | 'AUTHORIZED_SIGNATURE' | 'STAMP_SEAL' | 'OTHER';
  widthMm: number;
  heightMm: number;
  aspectRatio: number;
  lockAspectRatio: boolean;
  positionMode: 'inline' | 'square' | 'topBottom' | 'behind' | 'front';
  page: number;
  xMm: number;
  yMm: number;
  alignment: 'left' | 'center' | 'right' | 'custom';
  zIndex: number;
  isLocked: boolean;
  opacity: number;
}

export interface DocNode {
  type:
    | 'doc'
    | 'paragraph'
    | 'heading'
    | 'bulletList'
    | 'orderedList'
    | 'listItem'
    | 'horizontalRule'
    | 'hardBreak'
    | 'pageBreak'
    | 'text'
    | 'placeholder'
    | 'compensationTable'
    | 'table'
    | 'tableRow'
    | 'tableHeader'
    | 'tableCell'
    | 'documentImage';
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}
export type BlockAlign = 'left' | 'center' | 'right' | 'justify';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

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
const LIMITS = { nodes: 15000, depth: 20, characters: 60000 };
const COLOR = /^#[0-9a-f]{6}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
export function parseDocument(kind: TemplateKind | string, input: unknown): DocNode {
  const specific = (PLACEHOLDERS as Record<string, { key: string }[]>)[kind];
  const list = specific && specific.length > 0 ? specific : HR_COMMON_PLACEHOLDERS;
  const allowed = new Set([...list.map((p) => p.key), ...HR_COMMON_PLACEHOLDERS.map((p) => p.key)]);
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
        const markType = isRecord(m) && typeof m.type === 'string' ? m.type : 'unrecognized mark';
        fail(`The document has formatting that can’t be printed (${markType}). Remove it and try again.`);
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

const BORDER_STYLE_REGEX = /^([0-9]+(\.[0-9]+)?pt)\s+(solid|dashed|dotted)\s+(#[0-9a-f]{6})$/i;
const sanitizeBorder = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'none' || s === '0' || s === '0pt' || s === 'hidden') return 'none';
  const m = s.match(BORDER_STYLE_REGEX);
  if (m) {
    const pt = parseFloat(m[1]);
    if (pt >= 0.25 && pt <= 12) {
      return `${Math.round(pt * 100) / 100}pt ${m[3]} ${m[4]}`;
    }
  }
  return null;
};

  const cellAttrs = (attrs: Record<string, unknown>) => {
    const colwidth = Array.isArray(attrs.colwidth)
      ? attrs.colwidth.map((w) => num(w, 5, 2000, 'Column width')).filter((w): w is number => w !== null)
      : null;
    return {
      colspan: num(attrs.colspan ?? 1, 1, 50, 'Colspan') ?? 1,
      rowspan: num(attrs.rowspan ?? 1, 1, 100, 'Rowspan') ?? 1,
      colwidth: colwidth && colwidth.length ? colwidth : null,
      rowHeight: num(attrs.rowHeight, 8, 500, 'Row height'),
      borderTop: sanitizeBorder(attrs.borderTop),
      borderRight: sanitizeBorder(attrs.borderRight),
      borderBottom: sanitizeBorder(attrs.borderBottom),
      borderLeft: sanitizeBorder(attrs.borderLeft),
      backgroundColor: typeof attrs.backgroundColor === 'string' && COLOR.test(attrs.backgroundColor) ? attrs.backgroundColor.toLowerCase() : null,
      textAlign: typeof attrs.textAlign === 'string' && ALIGNS.includes(attrs.textAlign as BlockAlign) ? (attrs.textAlign as BlockAlign) : null,
      verticalAlign: typeof attrs.verticalAlign === 'string' && ['top', 'middle', 'bottom'].includes(attrs.verticalAlign) ? (attrs.verticalAlign as VerticalAlign) : null,
      padding: num(attrs.padding, 0, 48, 'Cell padding'),
    };
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
      case 'table': {
        const tableChildren = () => {
          const raw = Array.isArray((n as Record<string, unknown>).content)
            ? ((n as Record<string, unknown>).content as unknown[])
            : null;
          if (!raw || raw.length === 0) throw new DocumentProblem('A table must have at least one row.');
          return raw.map((c: unknown) => {
            if (!isRecord(c) || c.type !== 'tableRow') throw new DocumentProblem('A table must contain table rows.');
            return block(c, depth + 1, false);
          });
        };
        const alignment = typeof attrs.alignment === 'string' && ['left', 'center', 'right'].includes(attrs.alignment) ? attrs.alignment : 'left';
        return { type: 'table', attrs: { alignment }, content: tableChildren() };
      }
      case 'tableRow': {
        const rowChildren = () => {
          const raw = Array.isArray((n as Record<string, unknown>).content)
            ? ((n as Record<string, unknown>).content as unknown[])
            : null;
          if (!raw || raw.length === 0) throw new DocumentProblem('A table row must have at least one cell.');
          return raw.map((c: unknown) => {
            if (!isRecord(c) || (c.type !== 'tableCell' && c.type !== 'tableHeader')) throw new DocumentProblem('A table row must contain cells.');
            return block(c, depth + 1, false);
          });
        };
        return { type: 'tableRow', attrs: { rowHeight: num(attrs.rowHeight, 8, 500, 'Row height') }, content: rowChildren() };
      }
      case 'tableHeader':
      case 'tableCell': {
        const cellType = n.type as 'tableCell' | 'tableHeader';
        const cellChildren = () => {
          const raw = Array.isArray((n as Record<string, unknown>).content)
            ? ((n as Record<string, unknown>).content as unknown[])
            : null;
          if (!raw || raw.length === 0) {
            return [{ type: 'paragraph' as const, attrs: blockAttrs({}), content: [] }];
          }
          return raw.map((c: unknown) => {
            if (!isRecord(c) || !['paragraph', 'heading', 'bulletList', 'orderedList'].includes(c.type as string)) {
              return { type: 'paragraph' as const, attrs: blockAttrs({}), content: [] };
            }
            return block(c, depth + 1, false);
          });
        };
        return { type: cellType, attrs: cellAttrs(attrs), content: cellChildren() };
      }
      case 'documentImage': {
        const id = typeof attrs.id === 'string' && attrs.id.trim() ? attrs.id.trim() : randomUUID();
        const src = typeof attrs.src === 'string' ? attrs.src : '';
        const assetId = typeof attrs.assetId === 'string' && UUID.test(attrs.assetId) ? attrs.assetId : null;
        const alt = typeof attrs.alt === 'string' ? attrs.alt.slice(0, 300) : '';
        const category = typeof attrs.category === 'string' && ['COMPANY_LOGO', 'AUTHORIZED_SIGNATURE', 'STAMP_SEAL', 'OTHER'].includes(attrs.category)
          ? attrs.category
          : 'OTHER';
        const widthMm = num(attrs.widthMm, 5, 300, 'Image width (mm)') ?? 45;
        const heightMm = num(attrs.heightMm, 5, 400, 'Image height (mm)') ?? 20;
        const aspectRatio = typeof attrs.aspectRatio === 'number' && Number.isFinite(attrs.aspectRatio) && attrs.aspectRatio > 0
          ? Math.round(attrs.aspectRatio * 1000) / 1000
          : Math.round((widthMm / heightMm) * 1000) / 1000;
        const lockAspectRatio = attrs.lockAspectRatio !== false;
        const posMode = typeof attrs.positionMode === 'string' && ['inline', 'square', 'topBottom', 'behind', 'front'].includes(attrs.positionMode)
          ? (attrs.positionMode as 'inline' | 'square' | 'topBottom' | 'behind' | 'front')
          : 'front';
        const page = typeof attrs.page === 'number' && Number.isInteger(attrs.page) && attrs.page >= 1 && attrs.page <= 100
          ? attrs.page
          : 1;
        const xMm = num(attrs.xMm, -50, 400, 'Horizontal position (xMm)') ?? 20;
        const yMm = num(attrs.yMm, -50, 500, 'Vertical position (yMm)') ?? 20;
        const alignment = typeof attrs.alignment === 'string' && ['left', 'center', 'right', 'custom'].includes(attrs.alignment)
          ? (attrs.alignment as 'left' | 'center' | 'right' | 'custom')
          : 'left';
        const zIndex = typeof attrs.zIndex === 'number' && Number.isInteger(attrs.zIndex) ? Math.min(1000, Math.max(0, attrs.zIndex)) : 10;
        const isLocked = Boolean(attrs.isLocked);
        const opacity = typeof attrs.opacity === 'number' && Number.isFinite(attrs.opacity) ? Math.min(1, Math.max(0, Math.round(attrs.opacity * 100) / 100)) : 1;

        return {
          type: 'documentImage',
          attrs: {
            id,
            src,
            assetId,
            alt,
            category,
            widthMm,
            heightMm,
            aspectRatio,
            lockAspectRatio,
            positionMode: posMode,
            page,
            xMm,
            yMm,
            alignment,
            zIndex,
            isLocked,
            opacity,
          },
        };
      }
      case 'pageBreak':
        return { type: 'pageBreak' };
      default: {
        const typeName = isRecord(n) && typeof n.type === 'string' ? n.type : 'unrecognized block';
        return fail(`The document has content that can’t be printed (${typeName}). Remove it and try again.`);
      }
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
      else if (n.type === 'table') {
        for (const row of n.content ?? []) {
          const rowTexts: string[] = [];
          for (const cell of row.content ?? []) {
            const cellBlocks: string[] = [];
            const cellWalk = (subNodes: DocNode[] | undefined) => {
              for (const sub of subNodes ?? []) {
                if (sub.type === 'paragraph' || sub.type === 'heading') cellBlocks.push(textOf(sub.content));
                else if (sub.type === 'bulletList' || sub.type === 'orderedList') {
                  sub.content?.forEach((item) => cellWalk(item.content));
                }
              }
            };
            cellWalk(cell.content);
            const ct = cellBlocks.join(' ').trim();
            if (ct) rowTexts.push(ct);
          }
          if (rowTexts.length) blocks.push(rowTexts.join(' | '));
        }
      }
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

function buildDefaultSalaryTable(): DocNode {
  const makeCell = (
    textVal: string,
    options: {
      colspan?: number;
      rowspan?: number;
      colwidth?: number[];
      isHeader?: boolean;
      bold?: boolean;
      textAlign?: 'left' | 'center' | 'right' | 'justify';
      verticalAlign?: 'top' | 'middle' | 'bottom';
      backgroundColor?: string;
    } = {},
  ): DocNode => {
    const isH = Boolean(options.isHeader);
    const cellType = isH ? 'tableHeader' : 'tableCell';
    const marks: DocMark[] | undefined = options.bold ? [{ type: 'bold' }] : undefined;

    const pNode: DocNode = {
      type: 'paragraph',
      attrs: { ...noBlock, textAlign: options.textAlign || 'left', spaceBefore: 0, spaceAfter: 0, lineHeight: 1.15 },
      ...(textVal ? { content: withPlaceholders(textVal, marks) } : {}),
    };

    return {
      type: cellType,
      attrs: {
        colspan: options.colspan ?? 1,
        rowspan: options.rowspan ?? 1,
        colwidth: options.colwidth ?? null,
        rowHeight: null,
        borderTop: '0.75pt solid #000000',
        borderRight: '0.75pt solid #000000',
        borderBottom: '0.75pt solid #000000',
        borderLeft: '0.75pt solid #000000',
        backgroundColor: options.backgroundColor ?? null,
        textAlign: options.textAlign ?? null,
        verticalAlign: options.verticalAlign ?? 'middle',
        padding: 3,
      },
      content: [pNode],
    };
  };

  const r = (...cells: DocNode[]): DocNode => ({
    type: 'tableRow',
    content: cells,
  });

  return {
    type: 'table',
    attrs: { alignment: 'center' },
    content: [
      // Row 0: Annexure - A
      r(makeCell('Annexure - A', { colspan: 4, isHeader: true, bold: true, textAlign: 'center', backgroundColor: '#f8fafc' })),

      // Row 1: Title
      r(makeCell('Salary Structure for [{{candidate_name}} ({{designation}})]', { colspan: 4, isHeader: true, bold: true, textAlign: 'center', backgroundColor: '#f1f5f9' })),

      // Row 2: Headers
      r(
        makeCell('', { colwidth: [70], isHeader: true }),
        makeCell('', { colwidth: [35], isHeader: true }),
        makeCell('Head Of Account', { colwidth: [260], isHeader: true, bold: true, textAlign: 'center', backgroundColor: '#f8fafc' }),
        makeCell('Current', { colwidth: [120], isHeader: true, bold: true, textAlign: 'center', backgroundColor: '#f8fafc' }),
      ),

      // Row 3: Section A - Basic
      r(
        makeCell('INCOME', { rowspan: 3, bold: true, textAlign: 'center', verticalAlign: 'middle' }),
        makeCell('(A)', { rowspan: 3, bold: true, textAlign: 'center', verticalAlign: 'middle' }),
        makeCell('Basic Salary'),
        makeCell('{{basic_salary}}', { textAlign: 'right' }),
      ),
      // Row 4: HRA
      r(
        makeCell('House Rent Allowance'),
        makeCell('{{hra}}', { textAlign: 'right' }),
      ),
      // Row 5: Special Allowance
      r(
        makeCell('Special Allowance'),
        makeCell('{{special_allowance}}', { textAlign: 'right' }),
      ),

      // Row 6: Spacer
      r(makeCell(''), makeCell(''), makeCell(''), makeCell('')),

      // Row 7: Total Gross (A)
      r(
        makeCell(''),
        makeCell(''),
        makeCell('Total Gross (A)', { bold: true, textAlign: 'center' }),
        makeCell('{{gross_salary}}', { bold: true, textAlign: 'right' }),
      ),

      // Row 8: Spacer
      r(makeCell(''), makeCell(''), makeCell(''), makeCell('')),

      // Row 9: Section B - Retirals / Employer contribution
      r(
        makeCell('INCOME', { bold: true, textAlign: 'center', verticalAlign: 'middle' }),
        makeCell('(B)', { bold: true, textAlign: 'center', verticalAlign: 'middle' }),
        makeCell('Provident Fund (12%)', { bold: true, textAlign: 'center' }),
        makeCell('{{pf_employer}}', { textAlign: 'right' }),
      ),
      // Row 10: ESIC Employer
      r(
        makeCell('Company Contribution', { rowspan: 2, bold: true, textAlign: 'center', verticalAlign: 'middle' }),
        makeCell(''),
        makeCell('ESIC (3.25%)'),
        makeCell('{{esic_employer}}', { textAlign: 'right' }),
      ),
      // Row 11: Total (B)
      r(
        makeCell(''),
        makeCell('Total (B)', { bold: true }),
        makeCell('{{total_b}}', { bold: true, textAlign: 'right' }),
      ),

      // Row 12: Spacer
      r(makeCell(''), makeCell(''), makeCell(''), makeCell('')),

      // Row 13: Section C - Deductions
      r(
        makeCell('DEDUCTION', { bold: true, textAlign: 'center', verticalAlign: 'middle' }),
        makeCell('(C)', { bold: true, textAlign: 'center', verticalAlign: 'middle' }),
        makeCell('Provident Fund (12%)', { bold: true, textAlign: 'center' }),
        makeCell('{{pf_employee}}', { textAlign: 'right' }),
      ),
      // Row 14: ESIC Employee
      r(
        makeCell('Employee Contribution', { rowspan: 2, bold: true, textAlign: 'center', verticalAlign: 'middle' }),
        makeCell(''),
        makeCell('ESIC (0.75%)'),
        makeCell('{{esic_employee}}', { textAlign: 'right' }),
      ),
      // Row 15: Professional Tax
      r(
        makeCell(''),
        makeCell('Professional Tax'),
        makeCell('{{pt}}', { textAlign: 'right' }),
      ),
      // Row 16: Total (C)
      r(
        makeCell(''),
        makeCell(''),
        makeCell('Total (C)', { bold: true }),
        makeCell('{{total_c}}', { bold: true, textAlign: 'right' }),
      ),

      // Row 17: Spacer
      r(makeCell(''), makeCell(''), makeCell(''), makeCell('')),

      // Row 18: Net In-Hand
      r(
        makeCell(''),
        makeCell(''),
        makeCell('NET IN HAND SALARY (A - C)', { bold: true, textAlign: 'center' }),
        makeCell('{{net_salary}}', { bold: true, textAlign: 'right' }),
      ),

      // Row 19: Spacer
      r(makeCell(''), makeCell(''), makeCell(''), makeCell('')),

      // Row 20: Total Monthly CTC
      r(
        makeCell(''),
        makeCell('(C)', { bold: true, textAlign: 'center' }),
        makeCell('TOTAL MONTHLY CTC (A + B)', { bold: true, textAlign: 'center' }),
        makeCell('{{monthly_ctc}}', { bold: true, textAlign: 'right' }),
      ),

      // Row 21: Spacer
      r(makeCell(''), makeCell(''), makeCell(''), makeCell('')),

      // Row 22: Total Annually CTC
      r(
        makeCell(''),
        makeCell('(E)', { bold: true, textAlign: 'center' }),
        makeCell('TOTAL ANNUALLY CTC', { bold: true, textAlign: 'center' }),
        makeCell('{{annual_salary}}', { bold: true, textAlign: 'right' }),
      ),
    ],
  };
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
  if (kind === 'APPOINTMENT_LETTER') {
    return {
      type: 'doc',
      content: [
        heading(1, 'APPOINTMENT LETTER', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}\nCandidate ID: {{candidate_id}}', { spaceAfter: 14 }),
        p('To,\n{{candidate_name}}\n{{address}}', { spaceAfter: 12 }),
        p('Dear {{candidate_name}},', { spaceAfter: 10 }),
        p('With reference to your application and subsequent interviews, we are pleased to appoint you as {{designation}} in the {{department}} department at {{company_name}}.', { textAlign: 'justify' }),
        p('Your appointment is effective from your date of joining, {{joining_date}}. You will be placed on a probationary period of {{probation_period}} from the date of joining.', { textAlign: 'justify' }),
        p('Your annual compensation will be {{annual_salary}}, subject to statutory deductions and applicable company policies.', { textAlign: 'justify' }),
        { type: 'compensationTable' },
        heading(3, 'Place of Work & Reporting'),
        p('You will report to {{reporting_manager}} and will be located at {{work_location}}.', { textAlign: 'justify' }),
        heading(3, 'Terms of Appointment'),
        p('{{special_terms}}', { textAlign: 'justify' }),
        p('We welcome you to {{company_name}} and look forward to a long and mutually beneficial association.', { textAlign: 'justify' }),
        p('Sincerely,', { spaceBefore: 12, spaceAfter: 24 }),
        p('For {{company_name}}\nAuthorized Signatory'),
      ],
    };
  }
  if (kind === 'JOINING_LETTER') {
    return {
      type: 'doc',
      content: [
        heading(1, 'JOINING LETTER', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}\nReference: {{candidate_id}}', { spaceAfter: 14 }),
        p('Dear {{candidate_name}},', { spaceAfter: 10 }),
        p('We are pleased to confirm your joining at {{company_name}} in the position of {{designation}} within the {{department}} department.', { textAlign: 'justify' }),
        p('Your official date of joining is {{joining_date}}. You will report to {{reporting_manager}} at {{work_location}}.', { textAlign: 'justify' }),
        p('Please report to the HR department on your joining date with your original documents for verification.', { textAlign: 'justify' }),
        p('We wish you all the best and look forward to working with you.', { textAlign: 'justify' }),
        p('Sincerely,', { spaceBefore: 12, spaceAfter: 24 }),
        p('{{company_name}}\nHuman Resources'),
      ],
    };
  }
  if (kind === 'EMPLOYMENT_CONTRACT' || kind === 'EMPLOYMENT_AGREEMENT') {
    return {
      type: 'doc',
      content: [
        heading(1, 'EMPLOYMENT CONTRACT', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}\nContract Ref: {{candidate_id}}', { spaceAfter: 14 }),
        p('This Employment Contract is entered into between {{company_name}} and {{candidate_name}}.', { spaceAfter: 10 }),
        p('1. Position: The Employee shall be employed as {{designation}} in the {{department}} department.', { textAlign: 'justify' }),
        p('2. Commencement: Employment commences on {{joining_date}}.', { textAlign: 'justify' }),
        p('3. Compensation: The Employee will receive an annual salary of {{annual_salary}} payable in monthly installments.', { textAlign: 'justify' }),
        { type: 'compensationTable' },
        p('4. Probation: The initial probationary period will be {{probation_period}}.', { textAlign: 'justify' }),
        p('5. Reporting: The Employee shall report to {{reporting_manager}} at {{work_location}}.', { textAlign: 'justify' }),
        p('IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first above written.', { spaceBefore: 16 }),
        p('For {{company_name}}                                           Employee Signature\nAuthorized Signatory                                        {{candidate_name}}', { spaceBefore: 16 }),
      ],
    };
  }
  if (kind === 'WELCOME_LETTER') {
    return {
      type: 'doc',
      content: [
        heading(1, 'WELCOME TO THE TEAM', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}', { spaceAfter: 14 }),
        p('Dear {{candidate_name}},', { spaceAfter: 10 }),
        p('On behalf of everyone at {{company_name}}, we are thrilled to welcome you as our new {{designation}} in the {{department}} department!', { textAlign: 'justify' }),
        p('Your journey with us begins on {{joining_date}}. Your reporting manager {{reporting_manager}} and team at {{work_location}} are excited to have you on board.', { textAlign: 'justify' }),
        p('If you have any questions before your first day, please feel free to reach out to {{recruiter_name}}.', { textAlign: 'justify' }),
        p('Welcome aboard!', { spaceBefore: 12, spaceAfter: 24 }),
        p('Sincerely,\n{{company_name}} Team'),
      ],
    };
  }
  if (kind === 'NDA') {
    return {
      type: 'doc',
      content: [
        heading(1, 'NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}', { spaceAfter: 14 }),
        p('This Non-Disclosure Agreement is made by and between {{company_name}} and {{candidate_name}} (Candidate ID: {{candidate_id}}).', { spaceAfter: 10 }),
        p('1. Confidential Information: All proprietary technical, commercial, financial, and business information disclosed by {{company_name}} shall be treated as strictly confidential.', { textAlign: 'justify' }),
        p('2. Obligations: The Employee agrees not to disclose, publish, or share any Confidential Information without prior written authorization.', { textAlign: 'justify' }),
        p('3. Term: The obligations of confidentiality shall survive termination of employment.', { textAlign: 'justify' }),
        p('Signed for {{company_name}}                                     Signed by {{candidate_name}}\nAuthorized Signatory', { spaceBefore: 24 }),
      ],
    };
  }
  if (kind === 'EXPERIENCE_LETTER') {
    return {
      type: 'doc',
      content: [
        heading(1, 'EXPERIENCE CERTIFICATE', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}\nReference: {{candidate_id}}', { spaceAfter: 14 }),
        p('TO WHOMSOEVER IT MAY CONCERN', { textAlign: 'center', spaceAfter: 14 }),
        p('This is to certify that {{candidate_name}} was employed with {{company_name}} as {{designation}} in the {{department}} department.', { textAlign: 'justify' }),
        p('During their tenure with us, {{candidate_name}} was found to be hardworking, dedicated, and professional in carrying out all responsibilities.', { textAlign: 'justify' }),
        p('We wish them all the best in their future endeavors.', { textAlign: 'justify' }),
        p('For {{company_name}}\nAuthorized Signatory', { spaceBefore: 24 }),
      ],
    };
  }
  if (kind === 'RELIEVING_LETTER') {
    return {
      type: 'doc',
      content: [
        heading(1, 'RELIEVING LETTER', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}\nRef: {{candidate_id}}', { spaceAfter: 14 }),
        p('Dear {{candidate_name}},', { spaceAfter: 10 }),
        p('This letter confirms that you have been relieved from your duties as {{designation}} in the {{department}} department at {{company_name}}.', { textAlign: 'justify' }),
        p('All company assets, accounts, and dues have been settled satisfactorily.', { textAlign: 'justify' }),
        p('We appreciate your contributions and wish you every success in your future pursuits.', { textAlign: 'justify' }),
        p('Sincerely,\nFor {{company_name}}\nAuthorized Signatory', { spaceBefore: 24 }),
      ],
    };
  }
  if (kind === 'SALARY_REVISION') {
    return {
      type: 'doc',
      content: [
        heading(1, 'SALARY REVISION LETTER', { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}\nRef: {{candidate_id}}', { spaceAfter: 14 }),
        p('Dear {{candidate_name}},', { spaceAfter: 10 }),
        p('In recognition of your performance and valuable contributions to {{company_name}}, management is pleased to revise your compensation.', { textAlign: 'justify' }),
        p('Effective {{joining_date}}, your revised annual compensation will be {{annual_salary}} as {{designation}} in {{department}}.', { textAlign: 'justify' }),
        { type: 'compensationTable' },
        p('All other terms and conditions of your employment remain unchanged.', { textAlign: 'justify' }),
        p('Sincerely,\nFor {{company_name}}\nAuthorized Signatory', { spaceBefore: 24 }),
      ],
    };
  }
  if (kind !== 'OFFER_LETTER') {
    return {
      type: 'doc',
      content: [
        heading(1, (kind || 'HR DOCUMENT').replace(/_/g, ' '), { textAlign: 'center', spaceAfter: 18 }),
        p('Date: {{today}}\nRef: {{candidate_id}}', { spaceAfter: 14 }),
        p('Dear {{candidate_name}},', { spaceAfter: 10 }),
        p('This document is issued by {{company_name}} for {{candidate_name}}, appointed as {{designation}} in {{department}}.', { textAlign: 'justify' }),
        p('Terms & Details: Expected joining date is {{joining_date}}, reporting to {{reporting_manager}} at {{work_location}}.', { textAlign: 'justify' }),
        p('For any inquiries, please contact {{company_email}}.', { textAlign: 'justify' }),
        p('Sincerely,\nFor {{company_name}}\nAuthorized Signatory', { spaceBefore: 24 }),
      ],
    };
  }
  const bulletList = (...items: string[]): DocNode => ({
    type: 'bulletList',
    content: items.map((t) => ({
      type: 'listItem',
      content: [p(t, { spaceBefore: 0, spaceAfter: 2 })],
    })),
  });

  const orderedList = (...items: string[]): DocNode => ({
    type: 'orderedList',
    attrs: { start: 1 },
    content: items.map((t) => ({
      type: 'listItem',
      content: [p(t, { spaceBefore: 0, spaceAfter: 2 })],
    })),
  });

  return {
    type: 'doc',
    content: [
      // ═══════════════════════════════════════════════════════════════════════
      // Page 1: Offer Letter and Terms of Appointment
      // ═══════════════════════════════════════════════════════════════════════
      heading(1, 'OFFER LETTER', { textAlign: 'center', spaceAfter: 14 }),
      p('Date: {{today}}', { textAlign: 'right', spaceAfter: 14 }),
      p('To,\nName: {{candidate_name}}\nAddress: {{candidate_address}}\nMobile No.:+91 {{candidate_phone}}\nE-mail: {{candidate_email}}', { spaceAfter: 12 }),
      p('Dear {{candidate_name}},', { spaceAfter: 8 }),
      p('Welcome to the RnD Technosoft Family!', { spaceAfter: 8 }),
      p('RnD Technosoft is pleased to offer you the position of {{designation}}. We are confident that you would have a rewarding experience working with us in RnD Technosoft and the Company also would benefit from your knowledge & experience.', { textAlign: 'justify', spaceAfter: 10 }),
      p('The following are the terms of appointment for the above position:', { spaceAfter: 6 }),
      bulletList(
        'Your CTC would be as per details enclosed in Annexure - A.',
        'You will be eligible for leaves as per the “Leave Policy” of the company. (From January to December).',
        'You will be on probation for a period of 6 months from the date of joining.',
        'As a valuable resource of the organization, the management can utilize your services in any work of the Company.',
        'Notice period for resignation is 2 months.',
        'The appointment is liable to be terminated by the company for any breach of the terms and conditions of the contract detailed in the appointment letter.',
        'The detailed appointment letter elaborating the terms and conditions of the appointment will be issued to your joining the company.',
      ),
      p('The offer of appointment is provisional and subject to your reference checks being found satisfactory, verification of documents (Annexure - B) on your joining the Company.', { textAlign: 'justify', spaceBefore: 10, spaceAfter: 16 }),

      // ═══════════════════════════════════════════════════════════════════════
      // Page 2: Acceptance Notice and Annexure - A Salary Structure Table
      // ═══════════════════════════════════════════════════════════════════════
      { type: 'pageBreak' },
      p('On receipt of letter, please send the revered mail of acceptance within 7 days from the issuance of the letter. Please join latest by {{joining_date}} or earlier and report at RnD Technosoft, Vapi, failing which this offer would be deemed as cancelled.', { textAlign: 'justify', spaceAfter: 14 }),
      buildDefaultSalaryTable(),

      // ═══════════════════════════════════════════════════════════════════════
      // Page 3: Annexure - B Documents & Signatures
      // ═══════════════════════════════════════════════════════════════════════
      { type: 'pageBreak' },
      heading(2, 'Annexure - B', { spaceBefore: 18, spaceAfter: 8 }),
      p('The Following documents are required to be submitted by you at the time of joining (original and photocopy):', { spaceAfter: 6 }),
      orderedList(
        'Mark sheet and degree certificate for graduation & masters.',
        'Passport size photo',
        'Adhaar card',
        'Relieving letter of previous organization',
        'Appointment letter of previous organization',
        'Experience letter of previous each organization',
        'Last 3 month’s salary slip (with Self Attested)',
        'Acceptance of this Offer Letter (Hard Copy with Self Attested)',
        'Copy of the receipt issued by employer (as the case may be) along with UAN number.',
      ),
      p('With best wishes,\nYour faithfully,\nFor RnD Technosoft.', { spaceBefore: 12, spaceAfter: 14 }),
      p('Signature & Acknowledgment\n{{recruiter_name}}', { spaceAfter: 18 }),
      p('------------------------------------------------- Acceptance of offer --------------------------------------------', { textAlign: 'center', spaceAfter: 18 }),
      p('Signature & Acknowledgment                                                  Date: {{today}}\n{{candidate_name}}', { spaceBefore: 8 }),
    ],
  };
}

/** Whether a node is an empty paragraph (contains no text or only whitespace). */
export function isEmptyParagraphNode(node: DocNode): boolean {
  if (node.type !== 'paragraph') return false;
  if (!node.content || node.content.length === 0) return true;
  return node.content.every((c) => {
    if (c.type === 'text') return !c.text || !c.text.trim();
    if (c.type === 'hardBreak') return true;
    return false;
  });
}

/** Recursively checks whether a document contains a compensationTable node. */
export function hasCompensationTable(doc?: DocNode): boolean {
  if (!doc) return false;
  if (doc.type === 'compensationTable') return true;
  return (doc.content ?? []).some((child) => hasCompensationTable(child));
}

/**
 * Normalizes document nodes for rendering:
 * 1. Collapses runs of 5 or more consecutive empty paragraphs (typed by users to create manual page breaks) into a single pageBreak node.
 * 2. Removes empty paragraphs immediately preceding or following a pageBreak to avoid pushing content unnecessarily down the next page.
 */
export function cleanDocumentForRender(doc: DocNode): DocNode {
  if (!doc || !doc.content) return doc;
  const nodes = doc.content;
  const out: DocNode[] = [];
  let emptyRun: DocNode[] = [];

  const flushEmpty = () => {
    if (emptyRun.length >= 5) {
      out.push({ type: 'pageBreak' });
    } else {
      out.push(...emptyRun);
    }
    emptyRun = [];
  };

  for (const node of nodes) {
    if (isEmptyParagraphNode(node)) {
      emptyRun.push(node);
    } else {
      flushEmpty();
      if (node.type === 'pageBreak') {
        while (out.length > 0 && isEmptyParagraphNode(out[out.length - 1])) {
          out.pop();
        }
      }
      out.push(node);
    }
  }
  flushEmpty();

  const finalNodes: DocNode[] = [];
  let afterBreak = false;
  for (const n of out) {
    if (n.type === 'pageBreak') {
      finalNodes.push(n);
      afterBreak = true;
    } else if (afterBreak && isEmptyParagraphNode(n)) {
      continue;
    } else {
      afterBreak = false;
      finalNodes.push(n);
    }
  }

  return { ...doc, content: finalNodes };
}
