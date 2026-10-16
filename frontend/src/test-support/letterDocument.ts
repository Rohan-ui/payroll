import type { DocumentFormat, LetterDocument } from '../api/documents.api';

/** The document format the server sends with templates (its DOCUMENT_STYLE and PDF fonts). */
export const LETTER_FORMAT: DocumentFormat = {
  style: {
    fontFamily: 'helvetica',
    fontSize: 11,
    color: '#111111',
    lineHeight: 1.3,
    paragraph: { spaceBefore: 0, spaceAfter: 6 },
    listParagraph: { spaceBefore: 0, spaceAfter: 2 },
    headings: {
      1: { fontSize: 20, bold: true, italic: false, color: '#111111', spaceBefore: 0, spaceAfter: 10 },
      2: { fontSize: 16, bold: true, italic: false, color: '#111111', spaceBefore: 12, spaceAfter: 6 },
      3: { fontSize: 13, bold: true, italic: false, color: '#111111', spaceBefore: 10, spaceAfter: 4 },
      4: { fontSize: 12, bold: false, italic: true, color: '#444444', spaceBefore: 4, spaceAfter: 4 },
    },
    headingLineHeight: 1.2,
    listIndentMm: 7,
    rule: { spaceBefore: 6, spaceAfter: 6, thickness: 0.75, color: '#999999' },
    table: { spaceBefore: 6, spaceAfter: 10 },
    script: { scale: 0.75, raise: 0.33, drop: 0.2 },
  },
  fonts: [
    { key: 'helvetica', label: 'Helvetica (Arial)', css: 'Helvetica, Arial, sans-serif' },
    { key: 'times', label: 'Times New Roman', css: 'Times New Roman, Times, serif' },
    { key: 'courier', label: 'Courier New', css: 'Courier New, Courier, monospace' },
  ],
  fontSizes: { min: 6, max: 72, presets: [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48] },
};

export const text = (t: string, marks?: LetterDocument['marks']): LetterDocument => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
export const placeholder = (key: string): LetterDocument => ({ type: 'placeholder', attrs: { key } });
export const paragraph = (...content: LetterDocument[]): LetterDocument => ({ type: 'paragraph', content });
export const heading = (level: number, ...content: LetterDocument[]): LetterDocument => ({ type: 'heading', attrs: { level }, content });
export const letter = (...content: LetterDocument[]): LetterDocument => ({ type: 'doc', content });

/**
 * ProseMirror measures the page to keep the cursor in view; jsdom has no
 * layout, so ranges and points report empty boxes.
 */
export function stubLayout() {
  const empty = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  const rects = Object.assign([], { item: () => null });
  Object.assign(Range.prototype, { getClientRects: () => rects, getBoundingClientRect: () => empty });
  if (!document.elementFromPoint) Object.assign(document, { elementFromPoint: () => null });
}
