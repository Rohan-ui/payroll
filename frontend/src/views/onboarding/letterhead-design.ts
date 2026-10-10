import type { ElementFont, LetterheadAsset, LetterheadElement } from '../../api/onboarding.api';
import type { Page } from './letterhead-geometry';

/**
 * Page elements of a letterhead (text and image watermarks): making them,
 * copying them, laying copies out in a grid, and changing their layer. All in
 * millimetres on the page, as the PDF draws them. Elements are kept in paint
 * order with those behind the letter text first; every function here keeps that.
 */

/** The fonts a PDF can print, as the server's FONT_FAMILIES. */
export const ELEMENT_FONTS: { key: ElementFont; label: string; css: string }[] = [
  { key: 'helvetica', label: 'Helvetica (Arial)', css: 'Helvetica, Arial, sans-serif' },
  { key: 'times', label: 'Times New Roman', css: '"Times New Roman", Times, serif' },
  { key: 'courier', label: 'Courier New', css: '"Courier New", Courier, monospace' },
];
export const fontCss = (font: ElementFont | null) => (ELEMENT_FONTS.find((f) => f.key === font) ?? ELEMENT_FONTS[0]).css;

export const WATERMARK_PRESETS = ['CONFIDENTIAL', 'DRAFT', 'COPY', 'INTERNAL', 'APPROVED'];
/** A new watermark is faint until made stronger. */
export const WATERMARK_OPACITY = 0.25;
export const MAX_ELEMENTS = 60;
/** How far a copy lands from its original, right and down. */
export const DUPLICATE_OFFSET_MM = 5;
/** Text elements' line height, as a multiple of the font size; the PDF uses the same. */
export const ELEMENT_LINE_HEIGHT = 1.2;

let made = 0;
/** An id for an element not saved yet; the server gives saved ones their own. */
export const temporaryId = () => `new-${Date.now().toString(36)}-${(made += 1)}`;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** An element moved back onto the page if it runs off, and no larger than the page. */
export function onPage(element: LetterheadElement, page: Page): LetterheadElement {
  const width = round1(Math.min(element.width, page.width));
  const height = round1(Math.min(element.height, page.height));
  return { ...element, width, height, x: round1(clamp(element.x, 0, page.width - width)), y: round1(clamp(element.y, 0, page.height - height)) };
}

const centred = (page: Page, width: number, height: number) => ({ x: round1((page.width - width) / 2), y: round1((page.height - height) / 2), width, height });

/** A text watermark across the middle of the page, turned up to the right, faint, behind the text. */
export function textWatermark(text: string, page: Page): LetterheadElement {
  return {
    id: temporaryId(),
    kind: 'TEXT',
    ...centred(page, 160, 30),
    rotation: -45,
    opacity: WATERMARK_OPACITY,
    aboveText: false,
    hidden: false,
    locked: false,
    imageId: null,
    text,
    fontFamily: 'helvetica',
    fontSizePt: 48,
    bold: true,
    italic: false,
    color: '#64748b',
    align: 'center',
  };
}

/** An image watermark in the middle of the page, 80 mm wide in its own proportions (shorter if very tall), faint, behind the text. */
export function imageWatermark(asset: LetterheadAsset, page: Page): LetterheadElement {
  const scale = Math.min(80 / asset.widthPx, 120 / asset.heightPx);
  const width = round1(Math.max(3, asset.widthPx * scale));
  const height = round1(Math.max(3, asset.heightPx * scale));
  return {
    id: temporaryId(),
    kind: 'IMAGE',
    ...centred(page, width, height),
    rotation: 0,
    opacity: WATERMARK_OPACITY,
    aboveText: false,
    hidden: false,
    locked: false,
    imageId: asset.id,
    text: null,
    fontFamily: null,
    fontSizePt: null,
    bold: false,
    italic: false,
    color: null,
    align: null,
  };
}

/** A copy of an element, a little right of and below it, on the page, and not locked. */
export function duplicate(element: LetterheadElement, page: Page): LetterheadElement {
  return onPage({ ...element, id: temporaryId(), locked: false, x: element.x + DUPLICATE_OFFSET_MM, y: element.y + DUPLICATE_OFFSET_MM }, page);
}

/** Adds a copy just above its original in the same layer, and returns the copy's id with the new list. */
export function withDuplicate(elements: LetterheadElement[], id: string, page: Page) {
  const index = elements.findIndex((e) => e.id === id);
  if (index < 0) return null;
  const copy = duplicate(elements[index], page);
  return { elements: [...elements.slice(0, index + 1), copy, ...elements.slice(index + 1)], id: copy.id };
}

export interface GridSpec {
  rows: number;
  columns: number;
  /** Space between neighbouring copies, mm. */
  gapX: number;
  gapY: number;
}

/**
 * Copies of an element in rows and columns, centred on the page, each the
 * same size, turn, opacity and look as the element and editable on its own
 * afterwards. The element itself becomes the first copy. A grid that would not
 * fit on the page is refused with the reason.
 */
export function grid(element: LetterheadElement, spec: GridSpec, page: Page): LetterheadElement[] | string {
  const { rows, columns, gapX, gapY } = spec;
  if (![rows, columns].every((n) => Number.isInteger(n) && n >= 1 && n <= 12)) return 'Rows and columns are between 1 and 12.';
  if (![gapX, gapY].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return 'Spacing is between 0 and 100 mm.';
  const totalWidth = columns * element.width + (columns - 1) * gapX;
  const totalHeight = rows * element.height + (rows - 1) * gapY;
  if (totalWidth > page.width + 0.05) return `The grid is ${round1(totalWidth)} mm wide, wider than the page (${page.width} mm). Use fewer columns, less spacing or a smaller watermark.`;
  if (totalHeight > page.height + 0.05) return `The grid is ${round1(totalHeight)} mm tall, taller than the page (${page.height} mm). Use fewer rows, less spacing or a smaller watermark.`;
  const left = (page.width - totalWidth) / 2;
  const top = (page.height - totalHeight) / 2;
  const copies: LetterheadElement[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const first = row === 0 && column === 0;
      copies.push({ ...element, id: first ? element.id : temporaryId(), locked: first && element.locked, x: round1(left + column * (element.width + gapX)), y: round1(top + row * (element.height + gapY)) });
    }
  }
  return copies;
}

/** The list with an element replaced by a grid of it, in its place; or why not. */
export function withGrid(elements: LetterheadElement[], id: string, spec: GridSpec, page: Page): LetterheadElement[] | string {
  const index = elements.findIndex((e) => e.id === id);
  if (index < 0) return 'Select a watermark first.';
  const copies = grid(elements[index], spec, page);
  if (typeof copies === 'string') return copies;
  if (elements.length - 1 + copies.length > MAX_ELEMENTS) return `A letterhead has at most ${MAX_ELEMENTS} elements; this grid would make ${elements.length - 1 + copies.length}.`;
  return [...elements.slice(0, index), ...copies, ...elements.slice(index + 1)];
}

export type LayerMove = 'forward' | 'backward' | 'front' | 'back';

/**
 * An element moved one layer up or down, or to the very top or bottom. The
 * letter text is a layer too: moving up from just below it puts the element in
 * front of the text, and down from just above it, behind.
 */
export function moveLayer(elements: LetterheadElement[], id: string, move: LayerMove): LetterheadElement[] {
  const index = elements.findIndex((e) => e.id === id);
  if (index < 0) return elements;
  const element = elements[index];
  const rest = elements.filter((e) => e.id !== id);
  if (move === 'front') return [...rest, { ...element, aboveText: true }];
  if (move === 'back') return [{ ...element, aboveText: false }, ...rest];
  const list = [...elements];
  if (move === 'forward') {
    const next = list[index + 1];
    if (!element.aboveText && (!next || next.aboveText)) list[index] = { ...element, aboveText: true };
    else if (next) [list[index], list[index + 1]] = [next, element];
  } else {
    const previous = list[index - 1];
    if (element.aboveText && (!previous || !previous.aboveText)) list[index] = { ...element, aboveText: false };
    else if (previous) [list[index - 1], list[index]] = [element, previous];
  }
  return list;
}

/** What moveLayer can still do for an element: up, down. */
export function layerLimits(elements: LetterheadElement[], id: string) {
  const index = elements.findIndex((e) => e.id === id);
  const element = elements[index];
  return { canRaise: Boolean(element) && (index < elements.length - 1 || !element.aboveText), canLower: Boolean(element) && (index > 0 || element.aboveText) };
}

/** A short name for an element in lists and announcements. */
export function elementName(element: LetterheadElement) {
  if (element.kind === 'IMAGE') return 'Image watermark';
  const text = (element.text ?? '').replace(/\s+/g, ' ').trim();
  return `Text: ${text.length > 24 ? `${text.slice(0, 23)}…` : text}`;
}

/** The list with a new element on top of those behind the letter text. */
export function withElement(elements: LetterheadElement[], element: LetterheadElement): LetterheadElement[] {
  const firstInFront = elements.findIndex((e) => e.aboveText);
  const at = element.aboveText || firstInFront < 0 ? elements.length : firstInFront;
  return [...elements.slice(0, at), element, ...elements.slice(at)];
}
