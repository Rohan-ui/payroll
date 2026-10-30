import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import type { DocumentFormat } from '../../api/documents.api';
import { CustomTable, CustomTableRow, CustomTableCell, CustomTableHeader } from './table-extension';
import { DocumentImageExtension } from './document-image-extension';

/**
 * The letter editor's document schema. It stores only what the PDF renderer
 * draws (the server checks the same list): paragraphs and headings 1–4 with
 * alignment, line height, spacing (pt) and indent (mm); lists; rules; text in
 * the PDF's fonts with size (pt), colour and highlight; placeholders as their
 * own tokens; and, in offer letters and quotations, where their table goes.
 *
 * Formatting is read back only from what this editor itself writes (data-*
 * attributes), so text pasted from elsewhere can't bring in fonts or styles
 * the PDF can't print.
 */

type Attrs = Record<string, unknown>;
const numberFrom = (value: string | null) => (value === null || value === '' || Number.isNaN(Number(value)) ? null : Number(value));

/** Paragraph settings on paragraphs and headings. */
const BlockFormat = Extension.create({
  name: 'blockFormat',
  addGlobalAttributes() {
    const attribute = (name: string, data: string, css: (value: unknown) => string, parse: (v: string | null) => unknown = numberFrom) => ({
      default: null,
      parseHTML: (element: HTMLElement) => parse(element.getAttribute(`data-${data}`)),
      renderHTML: (attrs: Attrs) => (attrs[name] === null || attrs[name] === undefined ? {} : { [`data-${data}`]: String(attrs[name]), style: css(attrs[name]) }),
    });
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: attribute('textAlign', 'align', (v) => `text-align: ${v}`, (v) => (v && ['left', 'center', 'right', 'justify'].includes(v) ? v : null)),
          lineHeight: attribute('lineHeight', 'line-height', (v) => `line-height: ${v}`),
          spaceBefore: attribute('spaceBefore', 'space-before', (v) => `margin-top: ${v}pt`),
          spaceAfter: attribute('spaceAfter', 'space-after', (v) => `margin-bottom: ${v}pt`),
          indent: attribute('indent', 'indent', (v) => `margin-left: ${v}mm`),
        },
      },
    ];
  },
});

/** Font, size (pt), colour and highlight on text, kept in the textStyle mark. */
const TextFormat = (fonts: DocumentFormat['fonts']) =>
  Extension.create({
    name: 'textFormat',
    addGlobalAttributes() {
      const color = (v: string | null) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
      return [
        {
          types: ['textStyle'],
          attributes: {
            fontFamily: {
              default: null,
              parseHTML: (el: HTMLElement) => (fonts.some((f) => f.key === el.getAttribute('data-font')) ? el.getAttribute('data-font') : null),
              renderHTML: (a: Attrs) => {
                const font = fonts.find((f) => f.key === a.fontFamily);
                return font ? { 'data-font': font.key, style: `font-family: ${font.css}` } : {};
              },
            },
            fontSize: {
              default: null,
              parseHTML: (el: HTMLElement) => numberFrom(el.getAttribute('data-size')),
              renderHTML: (a: Attrs) => (a.fontSize ? { 'data-size': String(a.fontSize), style: `font-size: ${a.fontSize}pt` } : {}),
            },
            color: {
              default: null,
              parseHTML: (el: HTMLElement) => color(el.getAttribute('data-color')),
              renderHTML: (a: Attrs) => (a.color ? { 'data-color': String(a.color), style: `color: ${a.color}` } : {}),
            },
            backgroundColor: {
              default: null,
              parseHTML: (el: HTMLElement) => color(el.getAttribute('data-highlight')),
              renderHTML: (a: Attrs) => (a.backgroundColor ? { 'data-highlight': String(a.backgroundColor), style: `background-color: ${a.backgroundColor}` } : {}),
            },
          },
        },
      ];
    },
  });

/** A placeholder: one token, filled when a letter is made, that can be formatted like text. */
export const Placeholder = Node.create({
  name: 'placeholder',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { key: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-placeholder'), renderHTML: (a: Attrs) => ({ 'data-placeholder': a.key }) } };
  },
  parseHTML() {
    return [{ tag: 'span[data-placeholder]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'letter-placeholder' }), `{{${node.attrs.key}}}`];
  },
  renderText({ node }) {
    return `{{${node.attrs.key}}}`;
  },
});

/** The document: blocks, and (only here, never inside a list) the table. */
const LetterDoc = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | payTable)+',
});

/** Which table a document has: an offer's pay lines, or a quotation's items. */
export type TableKind = 'OFFER_LETTER' | 'QUOTATION';

/** Where the document prints its table (the offer's pay lines, or the quotation's items), shown with sample rows. */
export const CompensationTable = Node.create<{ kind: TableKind }>({
  name: 'compensationTable',
  group: 'payTable',
  atom: true,
  selectable: true,
  draggable: true,
  addOptions() {
    return { kind: 'OFFER_LETTER' };
  },
  parseHTML() {
    return [{ tag: 'div[data-pay-table]' }];
  },
  renderHTML() {
    const row = (label: string, amount: string, total = false): [string, Attrs, ...unknown[]] => ['div', { class: `letter-pay-row${total ? ' letter-pay-total' : ''}` }, ['span', {}, label], ['span', {}, amount]];
    if (this.options.kind === 'QUOTATION') {
      return [
        'div',
        { 'data-pay-table': '', class: 'letter-pay-table', 'aria-label': 'Items table: the quotation’s lines print here' },
        ['div', { class: 'letter-pay-heading' }, 'Quotation details'],
        row('Website design and development', 'INR 1,00,000.00'),
        row('Annual maintenance', 'INR 50,000.00'),
        row('Subtotal', 'INR 1,50,000.00'),
        row('CGST + SGST', 'INR 27,000.00'),
        row('Total', 'INR 1,77,000.00', true),
        ['div', { class: 'letter-pay-note' }, 'Sample rows: each quotation prints its own lines (description, SAC, quantity, rate, amount) and GST here.'],
      ];
    }
    return [
      'div',
      { 'data-pay-table': '', class: 'letter-pay-table', 'aria-label': 'Pay table: the offer’s pay lines print here' },
      ['div', { class: 'letter-pay-heading' }, 'Annual compensation'],
      row('Basic salary', 'INR 9,00,000.00'),
      row('House rent allowance', 'INR 3,60,000.00'),
      row('Total (CTC)', 'INR 18,00,000.00', true),
      ['div', { class: 'letter-pay-note' }, 'Sample rows: each offer prints its own pay lines here.'],
    ];
  },
});

/** A manual page break that splits content cleanly across physical pages. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML() {
    return [
      { tag: 'div[data-page-break]' },
      { tag: 'div.letter-page-break' },
    ];
  },
  renderHTML() {
    return [
      'div',
      { 'data-page-break': '', class: 'letter-page-break' },
      ['div', { class: 'letter-page-break-badge' }, 'Page Break'],
    ];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.commands.insertContent({ type: 'pageBreak' }),
    };
  },
});

/** The editor's extensions. Links, code and quotes are left out: the PDF doesn't print them. */
export function letterExtensions(format: DocumentFormat, table: TableKind | null = 'OFFER_LETTER') {
  return [
    StarterKit.configure({ document: false, code: false, codeBlock: false, blockquote: false, link: false, heading: { levels: [1, 2, 3, 4] }, undoRedo: { depth: 200 } }),
    LetterDoc,
    TextStyle,
    TextFormat(format.fonts),
    Subscript,
    Superscript,
    BlockFormat,
    Placeholder,
    CompensationTable.configure({ kind: table ?? 'OFFER_LETTER' }),
    CustomTable,
    CustomTableRow,
    CustomTableCell,
    CustomTableHeader,
    DocumentImageExtension,
    PageBreak,
  ];
}

/**
 * The page's styles for unformatted text, from the server's document style:
 * the same values the PDF renderer uses, in the same units (pt, mm).
 */
export function letterCss(scope: string, format: DocumentFormat) {
  const s = format.style;
  const font = format.fonts.find((f) => f.key === s.fontFamily)?.css ?? 'Helvetica, Arial, sans-serif';
  const pm = `${scope} .ProseMirror`;
  const headings = (['1', '2', '3', '4'] as const)
    .map((level) => {
      const h = s.headings[level];
      return `${pm} h${level} { font-size: ${h.fontSize}pt; font-weight: ${h.bold ? 700 : 400}; font-style: ${h.italic ? 'italic' : 'normal'}; color: ${h.color}; line-height: ${s.headingLineHeight}; margin: ${h.spaceBefore}pt 0 ${h.spaceAfter}pt 0; }`;
    })
    .join('\n');
  return `
${pm} { font-family: ${font}; font-size: ${s.fontSize}pt; line-height: ${s.lineHeight}; color: ${s.color}; outline: none; white-space: pre-wrap; word-wrap: break-word; }
${pm} p { margin: ${s.paragraph.spaceBefore}pt 0 ${s.paragraph.spaceAfter}pt 0; }
${headings}
${pm} > :first-child { margin-top: 0; }
${pm} ul, ${pm} ol { margin: 0; padding-left: ${s.listIndentMm}mm; }
${pm} ul { list-style: disc; }
${pm} ol { list-style: decimal; }
${pm} li > p { margin: ${s.listParagraph.spaceBefore}pt 0 ${s.listParagraph.spaceAfter}pt 0; }
${pm} hr { border: 0; border-top: ${s.rule.thickness}pt solid ${s.rule.color}; margin: ${s.rule.spaceBefore}pt 0 ${s.rule.spaceAfter}pt 0; }
${pm} strong { font-weight: 700; }
${pm} sup { font-size: ${s.script.scale * 100}%; vertical-align: ${s.script.raise / s.script.scale}em; line-height: 0; }
${pm} sub { font-size: ${s.script.scale * 100}%; vertical-align: -${s.script.drop / s.script.scale}em; line-height: 0; }
${pm} .letter-placeholder { background: rgba(20, 184, 166, 0.14); box-shadow: inset 0 -1px 0 rgba(13, 148, 136, 0.6); border-radius: 2px; }
${pm} .letter-placeholder.ProseMirror-selectednode { outline: 2px solid #0d9488; }
${pm} .letter-pay-table { margin: ${s.table.spaceBefore}pt 0 ${s.table.spaceAfter}pt 0; font-size: 10pt; border: 1px dashed #94a3b8; border-radius: 4px; padding: 4pt 6pt; color: #334155; }
${pm} .letter-pay-table.ProseMirror-selectednode { outline: 2px solid #0d9488; }
${pm} .letter-pay-heading { font-weight: 700; font-size: 11pt; margin-bottom: 3pt; }
${pm} .letter-pay-row { display: flex; justify-content: space-between; padding: 1pt 0; }
${pm} .letter-pay-total { font-weight: 700; border-top: 0.5pt solid #999; margin-top: 2pt; padding-top: 3pt; }
${pm} .letter-pay-note { margin-top: 3pt; font-size: 8pt; color: #64748b; font-style: italic; }

/* Custom Rich Tables */
${pm} table.letter-custom-table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  margin: ${s.table.spaceBefore}pt 0 ${s.table.spaceAfter}pt 0;
  box-sizing: border-box;
}
${pm} table.letter-custom-table td,
${pm} table.letter-custom-table th {
  vertical-align: top;
  box-sizing: border-box;
  position: relative;
  border: 0.75pt solid #cbd5e1;
  padding: 4pt 6pt;
  min-height: 18pt;
}
${pm} table.letter-custom-table th {
  font-weight: 600;
  background-color: #f8fafc;
}
${pm} .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  z-index: 20;
  background-color: #0d9488;
  pointer-events: none;
}
${pm}.resize-cursor {
  cursor: col-resize;
}
${pm} .selectedCell {
  background-color: rgba(13, 148, 136, 0.12) !important;
  outline: 1px solid #0d9488;
}
${pm} .selectedCell:after {
  z-index: 2;
  position: absolute;
  content: '';
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(13, 148, 136, 0.15);
  pointer-events: none;
}

/* Page Break in Editor and Print (Word/DOCX style paper separation) */
${pm} .letter-page-break {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
}
${pm} .letter-page-break-badge {
  position: relative;
  background: #0d9488;
  color: #ffffff;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 3px 12px;
  border-radius: 9999px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.25);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  z-index: 20;
}
${pm} .letter-page-break.ProseMirror-selectednode .letter-page-break-badge {
  outline: 2px solid #042f2e;
  outline-offset: 2px;
}
@media print {
  ${pm} .letter-page-break {
    break-before: page !important;
    page-break-before: always !important;
    height: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    visibility: hidden !important;
  }
}
`;
}
