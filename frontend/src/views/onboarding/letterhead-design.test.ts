import { describe, expect, it } from 'vitest';
import type { LetterheadElement } from '../../api/onboarding.api';
import { duplicate, grid, imageWatermark, layerLimits, moveLayer, onPage, textWatermark, withElement, withGrid } from './letterhead-design';
import { PAGE_SIZES } from './letterhead-geometry';

const A4 = PAGE_SIZES.A4;
const mark = (id: string, aboveText = false, extra: Partial<LetterheadElement> = {}): LetterheadElement => ({ ...textWatermark(id, A4), id, aboveText, ...extra });
const order = (elements: LetterheadElement[]) => elements.map((e) => `${e.id}${e.aboveText ? '+' : ''}`);

describe('letterhead elements', () => {
  it('start as faint watermarks in the middle of the page, behind the text', () => {
    expect(textWatermark('DRAFT', A4)).toMatchObject({ kind: 'TEXT', text: 'DRAFT', x: 25, y: 133.5, width: 160, height: 30, rotation: -45, opacity: 0.25, aboveText: false });
    // A wide image: 80 mm across, in its proportions.
    expect(imageWatermark({ id: 'a', widthPx: 1000, heightPx: 250 }, A4)).toMatchObject({ kind: 'IMAGE', imageId: 'a', width: 80, height: 20, x: 65, y: 138.5 });
    // A tall one is held to 120 mm high.
    expect(imageWatermark({ id: 'a', widthPx: 100, heightPx: 400 }, A4)).toMatchObject({ width: 30, height: 120 });
  });

  it('copy 5 mm right and down with every property, unlocked, and stay on the page', () => {
    const original = mark('a', true, { rotation: 45, opacity: 0.4, locked: true, x: 50, y: 80, width: 40 });
    const copy = duplicate(original, A4);
    expect(copy).toEqual({ ...original, id: copy.id, x: 55, y: 85, locked: false });
    expect(copy.id).not.toBe('a');
    expect(duplicate(mark('b', false, { x: 48, y: 265 }), A4)).toMatchObject({ x: 50, y: 267 });
    expect(onPage(mark('c', false, { x: -5, y: 400, width: 300 }), A4)).toMatchObject({ x: 0, width: 210, y: 267 });
  });

  it('lay out a grid of independent copies centred on the page, or say why not', () => {
    const small = mark('a', false, { width: 40, height: 30, rotation: 30, opacity: 0.3 });
    const copies = grid(small, { rows: 2, columns: 3, gapX: 20, gapY: 10 }, A4);
    if (typeof copies === 'string') throw new Error(copies);
    expect(copies).toHaveLength(6);
    expect(copies.map((c) => [c.x, c.y])).toEqual([[25, 113.5], [85, 113.5], [145, 113.5], [25, 153.5], [85, 153.5], [145, 153.5]]);
    expect(copies[0].id).toBe('a');
    expect(new Set(copies.map((c) => c.id)).size).toBe(6);
    expect(copies.every((c) => c.rotation === 30 && c.opacity === 0.3 && c.width === 40 && c.height === 30 && c.text === small.text)).toBe(true);
    expect(grid(small, { rows: 1, columns: 5, gapX: 20, gapY: 0 }, A4)).toContain('wider than the page');
    expect(grid(small, { rows: 9, columns: 1, gapX: 0, gapY: 10 }, A4)).toContain('taller than the page');
    expect(grid(small, { rows: 0, columns: 1, gapX: 0, gapY: 0 }, A4)).toBe('Rows and columns are between 1 and 12.');
    // In place of the original, within the element limit.
    const list = withGrid([mark('x'), small, mark('y', true)], 'a', { rows: 2, columns: 2, gapX: 0, gapY: 0 }, A4);
    expect(typeof list === 'string' ? list : order(list)).toEqual(['x', 'a', expect.any(String), expect.any(String), expect.any(String), 'y+']);
    const many = Array.from({ length: 55 }, (_, i) => mark(`m${i}`, false, { width: 10, height: 10 }));
    expect(withGrid(many, 'm0', { rows: 3, columns: 3, gapX: 0, gapY: 0 }, A4)).toContain('at most 60');
  });

  it('move through the layers, crossing the letter text between behind and in front', () => {
    const elements = [mark('a'), mark('b'), mark('c', true)];
    expect(order(moveLayer(elements, 'a', 'forward'))).toEqual(['b', 'a', 'c+']);
    // The top one behind the text moves in front of it, staying under those already there.
    expect(order(moveLayer(elements, 'b', 'forward'))).toEqual(['a', 'b+', 'c+']);
    expect(order(moveLayer(elements, 'c', 'backward'))).toEqual(['a', 'b', 'c']);
    expect(order(moveLayer(elements, 'a', 'front'))).toEqual(['b', 'c+', 'a+']);
    expect(order(moveLayer(elements, 'c', 'back'))).toEqual(['c', 'a', 'b']);
    expect(layerLimits(elements, 'a')).toEqual({ canRaise: true, canLower: false });
    expect(layerLimits(elements, 'c')).toEqual({ canRaise: false, canLower: true });
    // A new one goes on top of those behind the text.
    expect(order(withElement(elements, mark('n')))).toEqual(['a', 'b', 'n', 'c+']);
  });
});
